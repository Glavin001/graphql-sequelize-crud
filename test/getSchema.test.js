'use strict';

var expect = require('chai').expect;
const {
  GraphQLSchema
} = require('graphql');
const {
  getSchema
} = require('../src');
const Sequelize = require('sequelize');

describe('getSchema', function() {

  var sequelize, User, Todo;
  var r = Math.random().toString();

  before(function() {

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
      'node'
    ]);
    expect(schema._mutationType).to.be.an('object');
    expect(schema._mutationType._fields).to.be.an('object');
    expect(Object.keys(schema._mutationType._fields)).to.deep.equal([
      'createUser', 'updateUser', 'deleteUser',
      'createTodo', 'updateTodo', 'deleteTodo'
    ]);

  });
});


