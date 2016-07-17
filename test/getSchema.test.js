'use strict';

var expect = require('chai').expect;
const {
  graphql,
  GraphQLSchema
} = require('graphql');
const {
  getSchema
} = require('../src');
const Sequelize = require('sequelize');

describe('getSchema', function() {

  var sequelize, User, Todo, TodoAssignee;
  var r = Math.random().toString();

  before(function(cb) {

    sequelize = new Sequelize('database', 'username', 'password', {
      // sqlite! now!
      dialect: 'sqlite',

      // the storage engine for sqlite
      // - default ':memory:'
      // storage: 'path/to/database.sqlite'

      // disable logging; default: console.log
      logging: false

    });

    User = sequelize.define('User', {
      email: {
        type: Sequelize.STRING,
        allowNull: false,
        unique: true
      },
      password: {
        type: Sequelize.STRING,
        allowNull: false
      }
    }, {
      timestamps: false
    });
    Todo = sequelize.define('Todo', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
        allowNull: true
      },
      text: {
        type: Sequelize.STRING,
        allowNull: false
      },
      completed: {
        type: Sequelize.BOOLEAN,
        allowNull: false
      }
    }, {
      timestamps: true
    });
    User.hasMany(Todo, {
      as: 'todos',
      foreignKey: 'userId'
    });
    Todo.belongsTo(User, {
      as: 'user',
      foreignKey: 'userId'
    });

    TodoAssignee = sequelize.define('TodoAssignee', {
      primary: {
        type: Sequelize.BOOLEAN
      }
    }, {
      timestamps: true
    });

    // belongsToMany
    User.belongsToMany(Todo, {
      as: 'assignedTodos',
      through: TodoAssignee
    });
    Todo.belongsToMany(User, {
      as: 'assignees',
      through: TodoAssignee
    });

    sequelize.sync({
        false: true
      })
      .then(() => {
        cb();
      });


  });


  it('should return GraphQL Schema', function() {

    var schema = getSchema(sequelize);
    // console.log(Object.keys(schema));
    // console.log(Object.keys(schema._queryType._fields));
    // console.log(Object.keys(schema._mutationType._fields));

    expect(schema).to.be.an.instanceof(GraphQLSchema);
    expect(schema).to.be.an('object');
    expect(schema._queryType).to.be.an('object');
    expect(schema._queryType._fields).to.be.an('object');
    expect(Object.keys(schema._queryType._fields)).to.deep.equal([
      'root',
      'user', 'users',
      'todo', 'todos',
      'todoAssignee', 'todoAssignees',
      'node'
    ]);
    expect(schema._mutationType).to.be.an('object');
    expect(schema._mutationType._fields).to.be.an('object');
    expect(Object.keys(schema._mutationType._fields)).to.deep.equal([
      'createUser', 'updateUsers', 'deleteUsers',
      'createTodo', 'updateTodos', 'deleteTodos',
      'createTodoAssignee', 'updateTodoAssignees', 'deleteTodoAssignees'
    ]);

  });

  it('should successfully create records', function(cb) {

    var schema = getSchema(sequelize);

    let createUserMutation = `
      mutation createUserTest($input: createUserInput!) {
        createUser(input: $input) {
          newUser {
            id
          }
        }
      }
    `;
    let createUserVariables = {
      "input": {
        "email": "glavin.wiechert@gmail.com",
        "password": "glavin",
        "clientMutationId": "yo"
      }
    };
    let createTodoVariables = {
      "input": {
        "text": "Something",
        "completed": false,
        // userId,
        "clientMutationId": "yo"
      }
    };
    let createTodoAssigneeVariables1 = {
      "input": {
        "primary": true,
        // "UserId": userId,
        // "TodoId": todoId,
        "clientMutationId": "yo"
      }
    };
    // let createTodoAssigneeVariables2 = {
    //   "input": {
    //     "primary": false,
    //     "UserId": userId,
    //     "TodoId": todoId,
    //     "clientMutationId": "yo"
    //   }
    // };
    let userId, todoId;

    return graphql(schema, createUserMutation, {}, {}, createUserVariables)
      .then(result => {
        // console.log(JSON.stringify(result, undefined, 4));
        expect(result).to.be.an('object');
        expect(result.errors).to.be.equal(undefined, `An error occurred: ${result.errors}`);
        expect(result.data).to.be.an('object');
        expect(result.data.createUser).to.be.an('object');
        expect(result.data.createUser.newUser).to.be.an('object');
        expect(result.data.createUser.newUser.id).to.be.an('string');

        userId = result.data.createUser.newUser.id;

        let createTodoMutation = `
          mutation createTodoTest($input: createTodoInput!) {
            createTodo(input: $input) {
              newTodo {
                id
              }
            }
          }
        `;
        createTodoVariables.input.userId = userId;

        return graphql(schema, createTodoMutation, {}, {}, createTodoVariables);
      })
      .then(result => {
        // console.log(JSON.stringify(result, undefined, 4));
        expect(result).to.be.an('object');
        expect(result.errors).to.be.equal(undefined, `An error occurred: ${result.errors}`);
        expect(result.data).to.be.an('object');
        expect(result.data.createTodo).to.be.an('object');
        expect(result.data.createTodo.newTodo).to.be.an('object');
        expect(result.data.createTodo.newTodo.id).to.be.an('string');

        todoId = result.data.createTodo.newTodo.id;

        let createTodoAssigneeMutation = `
          mutation createTodoAssigneeTest($input: createTodoAssigneeInput!) {
            createTodoAssignee(input: $input) {
              newTodoAssignee {
                id
              }
            }
          }
        `;
        createTodoAssigneeVariables1.input.UserId = userId;
        createTodoAssigneeVariables1.input.TodoId = todoId;

        return graphql(schema, createTodoAssigneeMutation, {}, {}, createTodoAssigneeVariables1)
      })
      .then(result => {
        // console.log(JSON.stringify(result, undefined, 4));
        expect(result).to.be.an('object');
        expect(result.errors).to.be.equal(undefined, `An error occurred: ${result.errors}`);
        expect(result.data).to.be.an('object');
        expect(result.data.createTodoAssignee).to.be.an('object');
        expect(result.data.createTodoAssignee.newTodoAssignee).to.be.an('object');
        expect(result.data.createTodoAssignee.newTodoAssignee.id).to.be.an('string');

        let queryUser = `query {
          todos {
            id
            text
            completed
          }
          todoAssignees {
            id
            primary
            UserId
            TodoId
          }
          users {
            id
            email
            todos {
              total
              edges {
                node {
                  id
                  text
                  completed
                }
              }
            }
            assignedTodos {
              total
              edges {
                id
                primary
                node {
                  id
                  text
                  completed
                }
              }
            }
          }
        }`;
        return graphql(schema, queryUser);
      })
      .then(result => {
        // console.log(JSON.stringify(result, undefined, 4));
        expect(result).to.be.an('object');
        expect(result.data).to.be.an('object');

        expect(result.data.todoAssignees).to.be.an('array');
        expect(result.data.todoAssignees[0].id).to.be.an('string');

        expect(result.data.users).to.be.an('array');
        expect(result.data.users[0].id).to.be.an('string');

        expect(result.data.users[0].todos).to.be.an('object');
        expect(result.data.users[0].todos.edges).to.be.an('array');
        expect(result.data.users[0].todos.edges[0]).to.be.an('object');
        expect(result.data.users[0].todos.edges[0].node).to.be.an('object');

        expect(result.data.users[0].assignedTodos).to.be.an('object');
        expect(result.data.users[0].assignedTodos.total).to.be.an('number');
        expect(result.data.users[0].assignedTodos.edges).to.be.an('array');
        expect(result.data.users[0].assignedTodos.edges[0]).to.be.an('object');
        expect(result.data.users[0].assignedTodos.edges[0].id).to.be.an('string');
        expect(result.data.users[0].assignedTodos.edges[0].primary).to.be.an('boolean');
        expect(result.data.users[0].assignedTodos.edges[0].node).to.be.an('object');

        expect(result.data.users[0].assignedTodos.edges[0].primary).to.be.equal(true);
        expect(result.data.users[0].assignedTodos.edges[0].id).to.be.equal(result.data.todoAssignees[0].id);

        expect(result.data.users[0].assignedTodos.edges[0].node.id).to.be.an('string');
        expect(result.data.users[0].assignedTodos.edges[0].id).to.be.equal(result.data.todoAssignees[0].id);
        expect(result.data.users[0].assignedTodos.edges[0].node.id).to.be.equal(result.data.todos[0].id);
        expect(result.data.users[0].assignedTodos.edges[0].node.text).to.be.equal(createTodoVariables.input.text);
        expect(result.data.users[0].assignedTodos.edges[0].node.completed).to.be.equal(createTodoVariables.input.completed);

        cb();
      })
      .catch((error) => {
        cb(error);
      });

  });

  it('should successfully create and update User record', function(cb) {

    var schema = getSchema(sequelize);

    let createUserMutation = `
      mutation createUserTest($input: createUserInput!) {
        createUser(input: $input) {
          newUser {
            id
            email
            password
          }
        }
      }
    `;
    let createUserVariables = {
      "input": {
        "email": "glavin.wiechert2@gmail.com",
        "password": "glavin2",
        "clientMutationId": "yo"
      }
    };
    let updateUserMutation = `
      mutation updateUsersTest($input: updateUsersInput!) {
        updateUsers(input: $input) {
          affectedCount
          nodes {
            newUser {
              id
              email
              password
            }
          }
        }
      }
    `;
    let updateUserVariables = {
      "input": {
        "values": {
          "email": "glavin.wiechert3@gmail.com",
          "password": "glavin3"
        },
        "where": {
        },
        "clientMutationId": "yo"
      }
    };

    let userId;

    return graphql(schema, createUserMutation, {}, {}, createUserVariables)
      .then(result => {
        // console.log(JSON.stringify(result, undefined, 4));
        expect(result).to.be.an('object');
        expect(result.data).to.be.an('object');
        expect(result.data.createUser).to.be.an('object');
        expect(result.data.createUser.newUser).to.be.an('object');
        expect(result.data.createUser.newUser.id).to.be.an('string');

        userId = result.data.createUser.newUser.id;
        updateUserVariables.input.where.id = userId;

        // console.log(updateUserVariables);
        return graphql(schema, updateUserMutation, {}, {}, updateUserVariables);
      })
      .then(result => {
        // console.log(result, JSON.stringify(result, undefined, 4));
        expect(result).to.be.an('object');
        expect(result.data).to.be.an('object');
        expect(result.data.updateUsers).to.be.an('object');
        expect(result.data.updateUsers.nodes).to.be.an('array');
        expect(result.data.updateUsers.affectedCount).to.be.equal(1);
        expect(result.data.updateUsers.nodes.length).to.be.equal(1);
        expect(result.data.updateUsers.nodes[0]).to.be.an('object');
        expect(result.data.updateUsers.nodes[0].newUser).to.be.an('object');
        expect(result.data.updateUsers.nodes[0].newUser.id).to.be.an('string');
        expect(result.data.updateUsers.nodes[0].newUser.email).to.be.an('string');
        expect(result.data.updateUsers.nodes[0].newUser.password).to.be.an('string');

        expect(result.data.updateUsers.nodes[0].newUser.email).to.be.equal(updateUserVariables.input.values.email);
        expect(result.data.updateUsers.nodes[0].newUser.password).to.be.equal(updateUserVariables.input.values.password);

        cb();
      })
      .catch((error) => {
        cb(error);
      });

  });

});