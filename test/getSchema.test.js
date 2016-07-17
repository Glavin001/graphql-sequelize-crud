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
      'createUser', 'updateUser', 'deleteUser',
      'createTodo', 'updateTodo', 'deleteTodo',
      'createTodoAssignee', 'updateTodoAssignee', 'deleteTodoAssignee'
    ]);

  });

  it('should successfully createUser', function(cb) {

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

    let userId, todoId;

    return graphql(schema, createUserMutation, {}, {}, createUserVariables)
      .then(result => {
        console.log(JSON.stringify(result, undefined, 4));

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
        let createTodoVariables = {
          "input": {
            "text": "Something",
            "completed": false,
            userId,
            "clientMutationId": "yo"
          }
        };

        return graphql(schema, createTodoMutation, {}, {}, createTodoVariables);
      })
      .then(result => {
        console.log(JSON.stringify(result, undefined, 4));

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
        let createTodoAssigneeVariables1 = {
          "input": {
            "primary": true,
            "UserId": userId,
            "TodoId": todoId,
            "clientMutationId": "yo"
          }
        };
        let createTodoAssigneeVariables2 = {
          "input": {
            "primary": false,
            "UserId": userId,
            "TodoId": todoId,
            "clientMutationId": "yo"
          }
        };

        return graphql(schema, createTodoAssigneeMutation, {}, {}, createTodoAssigneeVariables2)
      })
      .then(result => {
        console.log(JSON.stringify(result, undefined, 4));

        let queryUser = `query {
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
        console.log(result);
        console.log(JSON.stringify(result, undefined, 4));
        cb();
      })
      .catch((error) => {
        cb(error);
      });

  });

});