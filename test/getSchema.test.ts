'use strict';
// tslint:disable no-multiline-string max-line-length insecure-random

import { expect } from 'chai';
import {
  graphql,
  GraphQLSchema,
  GraphQLString,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLError,
} from 'graphql';
import {
  getSchema,
  ModelTypes,
} from '../src';
import * as Sequelize from 'sequelize';
// tslint:disable-next-line:no-duplicate-imports
import { Sequelize as SequelizeType, ModelsHashInterface as Models } from "sequelize";

const debug = false;

describe('getSchema', () => {

  let rand: any;
  let sequelize: SequelizeType;
  // tslint:disable-next-line:variable-name
  let User: any;
  // tslint:disable-next-line:variable-name
  let Todo: any;
  // tslint:disable-next-line:variable-name
  let TodoAssignee: any;

  before((cb) => {

    sequelize = new Sequelize('database', 'username', 'password', {
      // sqlite! now!
      dialect: 'sqlite',

      // the storage engine for sqlite
      // - default ':memory:'
      // storage: 'path/to/database.sqlite'

      // disable logging; default: console.log
      logging: debug,

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
      },
      excludedField: {
        type: Sequelize.STRING,
        allowNull: true
      }
    }, {
        timestamps: false,
        classMethods: {
          queries: () => {
            return {};
          },
          mutations: (models: Models, modelTypes: ModelTypes) => {
            return {
              createCustom: {
                type: new GraphQLObjectType({
                  name: "Custom",
                  description: "Custom type for custom mutation",
                  fields: () => ({
                    customValueA: {
                      type: GraphQLString,
                    },
                    customValueB: {
                      type: GraphQLString,
                    },
                  })
                }),
                args: {
                  dataA: {
                    type: new GraphQLNonNull(GraphQLString)
                  },
                  dataB: {
                    type: new GraphQLNonNull(GraphQLString)
                  }
                },
                resolve: (obj: any, { dataA, dataB }: any) => {
                  return Promise.resolve({
                    customValueA: dataA,
                    customValueB: dataB,
                  });
                }
              }
            };
          }
        }
      });

    (<any>sequelize.models.User).excludeFields = ['excludedField'];

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
        type: Sequelize.BOOLEAN,
        allowNull: false,
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

    cb();

  });

  beforeEach((cb) => {

    // tslint:disable-next-line:no-magic-numbers
    rand = parseInt(`${Math.random() * 1000000000}`);

    sequelize.sync({
      force: true
    })
      .then(() => {
        cb();
      });

  });

  afterEach((cb) => {
    if (debug) {
      const { models } = sequelize;
      Promise.all(Object.keys(models)
        .map((modelName) => models[modelName].findAll()))
        // tslint:disable-next-line:no-console no-magic-numbers
        .then(result => console.log(JSON.stringify(result, null, 2)))
        .catch(error => console.error(error))
        .then(cb)
        ;
    } else {
      cb();
    }
  });

  it('should return GraphQL Schema', () => {

    const schema = getSchema(sequelize);
    // console.log(Object.keys(schema));
    // console.log(Object.keys(schema._queryType._fields));
    // console.log(Object.keys(schema._mutationType._fields));

    expect(schema).to.be.an.instanceof(GraphQLSchema);
    expect(schema).to.be.an('object');
    expect((<any>schema)._queryType).to.be.an('object');
    expect((<any>schema)._queryType._fields).to.be.an('object');
    expect(Object.keys((<any>schema)._queryType._fields)).to.deep.equal([
      'root',
      'user', 'users',
      'todo', 'todos',
      'todoAssignee', 'todoAssignees',
      'node'
    ]);
    expect((<any>schema)._mutationType).to.be.an('object');
    expect((<any>schema)._mutationType._fields).to.be.an('object');
    expect(Object.keys((<any>schema)._mutationType._fields)).to.deep.equal([
      'createUser', 'updateUser', 'updateUsers', 'deleteUser', 'deleteUsers',
      'createTodo', 'updateTodo', 'updateTodos', 'deleteTodo', 'deleteTodos',
      'createTodoAssignee', 'updateTodoAssignee', 'updateTodoAssignees', 'deleteTodoAssignee', 'deleteTodoAssignees',
      'createCustom',
    ]);

  });

  it('should successfully query empty records', (cb) => {
    const schema = getSchema(sequelize);
    const queryUser = `query {
      todos {
        id
        text
        completed
        user {
          id
          email
        }
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
    graphql(schema, queryUser)
      .then(result => {
        // console.log(JSON.stringify(result, undefined, 4));
        expect(result).to.be.an('object');
        expect(result.data).to.be.an('object');
        if (!result.data) {
          throw new Error("No data");
        }
        cb();
      })
      .catch((error) => {
        console.error(error);
        cb(error);
      })
      ;

  });

  it('should successfully create records', (cb) => {

    const schema = getSchema(sequelize);

    const createUserMutation = `
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
    const createUserVariables = {
      input: {
        email: `testuser${rand}@web.com`,
        password: `password${rand}`,
        clientMutationId: "test"
      }
    };
    const createTodoVariables = {
      input: {
        text: "Something",
        completed: false,
        userId: undefined as undefined | string,
        clientMutationId: "test"
      }
    };
    const createTodoAssigneeVariables1 = {
      input: {
        primary: true,
        UserId: undefined as string | undefined,
        TodoId: undefined as string | undefined,
        clientMutationId: "test"
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
    let userId: string;
    let todoId: string;

    return graphql(schema, createUserMutation, {}, {}, createUserVariables)
      .then(result => {
        // console.log(JSON.stringify(result, undefined, 4));
        expect(result).to.be.an('object');
        expect(result.errors).to.be.equal(undefined, `An error occurred: ${result.errors}`);
        expect(result.data).to.be.an('object');
        if (!result.data) {
          throw new Error("No data");
        }
        expect(result.data.createUser).to.be.an('object');
        expect(result.data.createUser.newUser).to.be.an('object');
        expect(result.data.createUser.newUser.id).to.be.an('string');

        expect(result.data.createUser.newUser.email).to.be.equal(createUserVariables.input.email);
        expect(result.data.createUser.newUser.password).to.be.equal(createUserVariables.input.password);

        userId = result.data.createUser.newUser.id;

        const createTodoMutation = `
          mutation createTodoTest($input: createTodoInput!) {
            createTodo(input: $input) {
              newTodo {
                id
                text
                completed
                user {
                  id
                  email
                }
              }
              user {
                id
                email
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
        if (!result.data) {
          throw new Error("No data");
        }
        expect(result.data.createTodo).to.be.an('object');
        expect(result.data.createTodo.newTodo).to.be.an('object');
        expect(result.data.createTodo.newTodo.id).to.be.an('string');

        expect(result.data.createTodo.user).to.be.an('object');
        expect(result.data.createTodo.user.id).to.be.an('string');

        expect(result.data.createTodo.newTodo.text).to.be.equal(createTodoVariables.input.text);
        expect(result.data.createTodo.newTodo.completed).to.be.equal(createTodoVariables.input.completed);

        todoId = result.data.createTodo.newTodo.id;

        const createTodoAssigneeMutation = `
          mutation createTodoAssigneeTest($input: createTodoAssigneeInput!) {
            createTodoAssignee(input: $input) {
              newTodoAssignee {
                id
                primary
              }
            }
          }
        `;
        createTodoAssigneeVariables1.input.UserId = userId;
        createTodoAssigneeVariables1.input.TodoId = todoId;

        return graphql(schema, createTodoAssigneeMutation, {}, {}, createTodoAssigneeVariables1);
      })
      .then(result => {
        // console.log(JSON.stringify(result, undefined, 4));
        expect(result).to.be.an('object');
        expect(result.errors).to.be.equal(undefined, `An error occurred: ${result.errors}`);
        expect(result.data).to.be.an('object');
        if (!result.data) {
          throw new Error("No data");
        }
        expect(result.data.createTodoAssignee).to.be.an('object');
        expect(result.data.createTodoAssignee.newTodoAssignee).to.be.an('object');
        expect(result.data.createTodoAssignee.newTodoAssignee.id).to.be.an('string');

        expect(result.data.createTodoAssignee.newTodoAssignee.primary)
          .to.be.equal(createTodoAssigneeVariables1.input.primary);

        const queryUser = `query {
          todos {
            id
            text
            completed
            user {
              id
              email
            }
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
        if (!result.data) {
          throw new Error("No data");
        }

        expect(result.data.todoAssignees).to.be.an('array');
        expect(result.data.todoAssignees[0].id)
          .to.be.an('string')
          .equal('VG9kb0Fzc2lnbmVlOjE=');

        expect(result.data.users).to.be.an('array');
        expect(result.data.users[0].id)
          .to.be.an('string')
          .equal('VXNlcjox');

        expect(result.data.users[0].todos).to.be.an('object');
        expect(result.data.users[0].todos.edges).to.be.an('array');
        expect(result.data.users[0].todos.edges[0]).to.be.an('object');
        expect(result.data.users[0].todos.edges[0].node).to.be.an('object');

        expect(result.data.todos[0].user).to.be.an('object');
        expect(result.data.todos[0].user.id)
          .to.be.an('string')
          .equal(result.data.users[0].id);

        expect(result.data.users[0].assignedTodos).to.be.an('object');
        expect(result.data.users[0].assignedTodos.total).to.be.an('number');
        expect(result.data.users[0].assignedTodos.edges).to.be.an('array');
        expect(result.data.users[0].assignedTodos.edges[0]).to.be.an('object');
        expect(result.data.users[0].assignedTodos.edges[0].primary).to.be.an('boolean');
        expect(result.data.users[0].assignedTodos.edges[0].node).to.be.an('object');

        expect(result.data.users[0].assignedTodos.edges[0].primary).to.be.equal(true);
        expect(result.data.users[0].assignedTodos.edges[0].id)
          .to.be.an('string')
          .equal(result.data.todoAssignees[0].id);

        expect(result.data.users[0].assignedTodos.edges[0].node.id).to.be.an('string');
        expect(result.data.users[0].assignedTodos.edges[0].id)
          .to.be.an('string')
          .equal(result.data.todoAssignees[0].id);
        expect(result.data.users[0].assignedTodos.edges[0].node.id)
          .to.be.an('string')
          .equal(result.data.todos[0].id);
        expect(result.data.users[0].assignedTodos.edges[0].node.text)
          .to.be.an('string')
          .equal(createTodoVariables.input.text);
        expect(result.data.users[0].assignedTodos.edges[0].node.completed)
          .to.be.an('boolean')
          .equal(createTodoVariables.input.completed);

        cb();
      })
      .catch((error) => {
        cb(error);
      });

  });

  it('should successfully create and update single User record', (cb) => {

    const schema = getSchema(sequelize);

    const createUserMutation = `
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
    const createUserVariables = {
      input: {
        email: `testuser${rand}@web.com`,
        password: `password${rand}`,
        clientMutationId: "test"
      }
    };
    const updateUserMutation = `
      mutation updateUserTest($input: updateUserInput!) {
        updateUser(input: $input) {
          newUser {
            id
            email
            password
          }
        }
      }
    `;
    const updateUserVariables = {
      input: {
        id: undefined as string | undefined,
        values: {
          email: `testuser${rand + 1}@web.com`,
          password: `password${rand - 1}`,
        },
        clientMutationId: "test"
      }
    };

    let userId;

    return graphql(schema, createUserMutation, {}, {}, createUserVariables)
      .then(result => {
        // console.log(JSON.stringify(result, undefined, 4));
        expect(result).to.be.an('object');
        expect(result.data).to.be.an('object');
        if (!result.data) {
          throw new Error("No data");
        }
        expect(result.data.createUser).to.be.an('object');
        expect(result.data.createUser.newUser).to.be.an('object');
        expect(result.data.createUser.newUser.id)
          .to.be.an('string')
          .equal('VXNlcjox');

        userId = result.data.createUser.newUser.id;
        updateUserVariables.input.id = userId;

        // console.log(updateUserVariables);
        return graphql(schema, updateUserMutation, {}, {}, updateUserVariables);
      })
      .then(result => {
        // console.log(JSON.stringify(result, undefined, 4));
        expect(result).to.be.an('object');
        expect(result.data).to.be.an('object');
        if (!result.data) {
          throw new Error("No data");
        }
        expect(result.data.updateUser).to.be.an('object');
        expect(result.data.updateUser.newUser).to.be.an('object');
        expect(result.data.updateUser.newUser.id)
          .to.be.an('string')
          .equal(updateUserVariables.input.id);
        expect(result.data.updateUser.newUser.email).to.be.an('string');
        expect(result.data.updateUser.newUser.password).to.be.an('string');

        expect(result.data.updateUser.newUser.id)
          .to.be.an('string')
          .equal(updateUserVariables.input.id);
        expect(result.data.updateUser.newUser.email)
          .to.be.an('string')
          .equal(updateUserVariables.input.values.email);
        expect(result.data.updateUser.newUser.password)
          .to.be.an('string')
          .equal(updateUserVariables.input.values.password);

        cb();
      })
      .catch((error) => {
        cb(error);
      });

  });

  it('should successfully create and update User records', (cb) => {

    const schema = getSchema(sequelize);

    const createUserMutation = `
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
    const createUserVariables = {
      input: {
        email: `testuser${rand}@web.com`,
        password: `password${rand}`,
        clientMutationId: "test"
      }
    };
    const updateUsersMutation = `
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
    const updateUsersVariables = {
      input: {
        values: {
          email: `testuser${rand + 1}@web.com`,
          password: `password${rand + 1}`,
        },
        where: {} as any,
        clientMutationId: "test"
      }
    };

    let userId;

    return graphql(schema, createUserMutation, {}, {}, createUserVariables)
      .then(result => {
        // console.log(JSON.stringify(result, undefined, 4));
        expect(result).to.be.an('object');
        expect(result.data).to.be.an('object');
        if (!result.data) {
          throw new Error("No data");
        }
        expect(result.data.createUser).to.be.an('object');
        expect(result.data.createUser.newUser).to.be.an('object');
        expect(result.data.createUser.newUser.id)
          .to.be.an('string')
          .equal('VXNlcjox');

        userId = result.data.createUser.newUser.id;
        updateUsersVariables.input.where.id = userId;

        // console.log(updateUserVariables);
        return graphql(schema, updateUsersMutation, {}, {}, updateUsersVariables);
      })
      .then(result => {
        // console.log(result, JSON.stringify(result, undefined, 4));
        expect(result).to.be.an('object');
        expect(result.data).to.be.an('object');
        if (!result.data) {
          throw new Error("No data");
        }
        expect(result.data.updateUsers).to.be.an('object');
        expect(result.data.updateUsers.nodes).to.be.an('array');
        expect(result.data.updateUsers.nodes.length).to.be.equal(1);
        expect(result.data.updateUsers.affectedCount)
          .to.be.an('number')
          .equal(1);
        expect(result.data.updateUsers.nodes[0]).to.be.an('object');
        expect(result.data.updateUsers.nodes[0].newUser).to.be.an('object');
        expect(result.data.updateUsers.nodes[0].newUser.id)
          .to.be.an('string')
          .equal(updateUsersVariables.input.where.id);
        expect(result.data.updateUsers.nodes[0].newUser.email).to.be.an('string');
        expect(result.data.updateUsers.nodes[0].newUser.password).to.be.an('string');

        expect(result.data.updateUsers.nodes[0].newUser.email).to.be.equal(updateUsersVariables.input.values.email);
        expect(result.data.updateUsers.nodes[0].newUser.password).to.be.equal(updateUsersVariables.input.values.password);

        cb();
      })
      .catch((error) => {
        cb(error);
      });

  });

  it('should successfully create and delete User records', (cb) => {

    const schema = getSchema(sequelize);

    const createUserMutation = `
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
    const createUserVariables = {
      input: {
        email: `testuser${rand}@web.com`,
        password: `password${rand}`,
        clientMutationId: "test"
      }
    };
    const deleteUsersMutation = `
      mutation deleteUsersTest($input: deleteUsersInput!) {
        deleteUsers(input: $input) {
          affectedCount
        }
      }
    `;
    const deleteUsersVariables = {
      input: {
        where: {} as any,
        clientMutationId: "test"
      }
    };

    let userId;

    return graphql(schema, createUserMutation, {}, {}, createUserVariables)
      .then(result => {
        // console.log(JSON.stringify(result, undefined, 4));
        expect(result).to.be.an('object');
        expect(result.data).to.be.an('object');
        if (!result.data) {
          throw new Error("No data");
        }
        expect(result.data.createUser).to.be.an('object');
        expect(result.data.createUser.newUser).to.be.an('object');
        expect(result.data.createUser.newUser.id)
          .to.be.an('string')
          .equal('VXNlcjox');

        userId = result.data.createUser.newUser.id;
        deleteUsersVariables.input.where.id = userId;

        // console.log(updateUserVariables);
        return graphql(schema, deleteUsersMutation, {}, {}, deleteUsersVariables);
      })
      .then(result => {
        // console.log(result);
        // console.log(JSON.stringify(result, undefined, 4));
        expect(result).to.be.an('object');
        expect(result.data).to.be.an('object');
        if (!result.data) {
          throw new Error("No data");
        }
        expect(result.data.deleteUsers).to.be.an('object');
        // expect(result.data.deleteUsers.nodes).to.be.an('array');
        expect(result.data.deleteUsers.affectedCount).to.be.equal(1);
        // expect(result.data.deleteUsers.nodes.length).to.be.equal(1);
        // expect(result.data.deleteUsers.nodes[0]).to.be.an('object');
        // expect(result.data.deleteUsers.nodes[0].newUser).to.be.an('object');
        // expect(result.data.deleteUsers.nodes[0].newUser.id).to.be.an('string');
        // expect(result.data.deleteUsers.nodes[0].newUser.email).to.be.an('string');
        // expect(result.data.deleteUsers.nodes[0].newUser.password).to.be.an('string');
        //
        // expect(result.data.deleteUsers.nodes[0].newUser.email).to.be.equal(updateUserVariables.input.values.email);
        // expect(result.data.deleteUsers.nodes[0].newUser.password).to.be.equal(updateUserVariables.input.values.password);

        cb();
      })
      .catch((error) => {
        cb(error);
      });

  });

  it('should successfully create and delete single User record', (cb) => {

    const schema = getSchema(sequelize);

    const createUserMutation = `
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
    const createUserVariables = {
      input: {
        email: `testuser${rand}@web.com`,
        password: `password${rand}`,
        clientMutationId: "test"
      }
    };
    const deleteUserMutation = `
      mutation deleteUserTest($input: deleteUserInput!) {
        deleteUser(input: $input) {
          deletedUserId
        }
      }
    `;
    const deleteUserVariables = {
      input: {
        clientMutationId: "test",
        id: undefined as string | undefined
      }
    };

    let userId;

    return graphql(schema, createUserMutation, {}, {}, createUserVariables)
      .then(result => {
        // console.log(JSON.stringify(result, undefined, 4));
        expect(result).to.be.an('object');
        expect(result.data).to.be.an('object');
        if (!result.data) {
          throw new Error("No data");
        }
        expect(result.data.createUser).to.be.an('object');
        expect(result.data.createUser.newUser).to.be.an('object');
        expect(result.data.createUser.newUser.id)
          .to.be.an('string')
          .equal('VXNlcjox');

        userId = result.data.createUser.newUser.id;
        deleteUserVariables.input.id = userId;

        // console.log(updateUserVariables);
        return graphql(schema, deleteUserMutation, {}, {}, deleteUserVariables);
      })
      .then(result => {
        // console.log(result);
        // console.log(JSON.stringify(result, undefined, 4));
        expect(result).to.be.an('object');
        expect(result.data).to.be.an('object');
        if (!result.data) {
          throw new Error("No data");
        }
        expect(result.data.deleteUser).to.be.an('object');
        // tslint:disable-next-line:id-length
        expect(result.data.deleteUser.deletedUserId).to.be.a('string');
        expect(result.data.deleteUser.deletedUserId).to.be.equal(deleteUserVariables.input.id);
        // expect(result.data.deleteUsers.nodes.length).to.be.equal(1);
        // expect(result.data.deleteUsers.nodes[0]).to.be.an('object');
        // expect(result.data.deleteUsers.nodes[0].newUser).to.be.an('object');
        // expect(result.data.deleteUsers.nodes[0].newUser.id).to.be.an('string');
        // expect(result.data.deleteUsers.nodes[0].newUser.email).to.be.an('string');
        // expect(result.data.deleteUsers.nodes[0].newUser.password).to.be.an('string');
        //
        // expect(result.data.deleteUsers.nodes[0].newUser.email).to.be.equal(updateUserVariables.input.values.email);
        // expect(result.data.deleteUsers.nodes[0].newUser.password).to.be.equal(updateUserVariables.input.values.password);

        cb();
      })
      .catch((error) => {
        cb(error);
      });

  });

  it('should fail to create user with excluded field', (cb) => {

    const schema = getSchema(sequelize);

    const createUserMutation = `
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
    const createUserVariables = {
      input: {
        email: `testuser${rand}@web.com`,
        password: `password${rand}`,
        excludedField: `excluded${rand}`,
        clientMutationId: "test"
      }
    };

    return graphql(schema, createUserMutation, {}, {}, createUserVariables)
      .then(result => {
        const { errors = [] } = result;
        expect(errors).to.be.length(1);
        const error = errors[0];
        expect(error).to.be.instanceOf(GraphQLError);
        expect(error.message)
          .to.be.an('string')
          .to.contain('excludedField')
          .to.contain('Unknown field');
        cb();
      })
      .catch((error: Error) => {
        cb(error);
      });

  });

  it('should fail to create user with excluded field', (cb) => {

    const schema = getSchema(sequelize);

    const createUserMutation = `
      mutation createCustom($input: createUserInput!) {
        createUser(input: $input) {
          newUser {
            id
            email
            password
          }
        }
      }
    `;
    const createUserVariables = {
      input: {
        email: `testuser${rand}@web.com`,
        password: `password${rand}`,
        excludedField: `excluded${rand}`,
        clientMutationId: "test"
      }
    };

    return graphql(schema, createUserMutation, {}, {}, createUserVariables)
      .then(result => {
        const { errors = [] } = result;
        expect(errors).to.be.length(1);
        const error = errors[0];
        expect(error).to.be.instanceOf(GraphQLError);
        expect(error.message)
          .to.be.an('string')
          .to.contain('excludedField')
          .to.contain('Unknown field');
        cb();
      })
      .catch((error: Error) => {
        cb(error);
      });

  });

  it('should successfully create custom record with custom mutation', (cb) => {

    const schema = getSchema(sequelize);

    const createCustomMutation = `
    mutation createCustomTest($dataA: String!, $dataB: String!) {
      createCustom(dataA: $dataA, dataB: $dataB) {
        customValueA
        customValueB
      }
    }
    `;
    const createCustomVariables = {
      dataA: "hello",
      dataB: "world"
    };

    return graphql(schema, createCustomMutation, {}, {}, createCustomVariables)
      .then(result => {
        expect(result).to.be.an('object');

        const { errors = [] } = result;
        expect(errors).to.be.length(0);

        expect(result.data).to.be.an('object');
        if (!result.data) {
          throw new Error("No data");
        }
        expect(result.data.createCustom).to.be.an('object');
        expect(result.data.createCustom.customValueA)
          .to.be.an('string')
          .equal('hello')
          ;
        expect(result.data.createCustom.customValueB)
          .to.be.an('string')
          .equal('world')
          ;

        cb();
      })
      .catch((error: Error) => {
        cb(error);
      });

  });

});
