'use strict';

const {
  getSchema
} = require('../src');
const Sequelize = require('sequelize');
const express = require('express');
const graphqlHTTP = require('express-graphql');

const app = express();
const sequelize = new Sequelize('database', 'username', 'password', {
  // sqlite! now!
  dialect: 'sqlite',

  // the storage engine for sqlite
  // - default ':memory:'
  // storage: 'path/to/database.sqlite'
});

const User = sequelize.define('User', {
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
const Todo = sequelize.define('Todo', {
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

sequelize.sync({
  false: true
})
.then(() => {

  const schema = getSchema(sequelize);

  app.use('/graphql', graphqlHTTP({
    schema: schema,
    graphiql: true
  }));

  const port = 3000;
  app.listen(port, () => {
    console.log(`Listening on port ${port}`);
  });

});
