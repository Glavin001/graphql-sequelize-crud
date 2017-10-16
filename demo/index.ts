'use strict';

import {
  GraphQLString,
  GraphQLNonNull,
  GraphQLObjectType,
} from 'graphql';
// tslint:disable-next-line:no-duplicate-imports
import { ModelsHashInterface as Models } from "sequelize";
import * as Sequelize from 'sequelize';
import * as express from 'express';
import * as graphqlHTTP from 'express-graphql';
// tslint:disable-next-line:no-require-imports no-var-requires
const { express: playground } = require('graphql-playground/middleware');

import {
  getSchema,
  ModelTypes,
} from '../src';

const app = express();
const sequelize = new Sequelize('database', 'username', 'password', {
  // sqlite! now!
  dialect: 'sqlite',

  // the storage engine for sqlite
  // - default ':memory:'
  // storage: 'path/to/database.sqlite'

  // disable logging; default: console.log
  // logging: false

});

// tslint:disable-next-line:variable-name
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
    timestamps: true,
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

// tslint:disable-next-line:variable-name
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

// tslint:disable-next-line:variable-name
const TodoAssignee = sequelize.define('TodoAssignee', {
  primary: {
    type: Sequelize.BOOLEAN
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
  force: true
})
  .then(() => {

    const schema = getSchema(sequelize);

    app.use('/graphql', graphqlHTTP({
      schema,
      graphiql: true
    }));

    app.use('/playground', playground({ endpoint: '/graphql' }));

    const port = 3000;
    app.listen(port, () => {
      // tslint:disable-next-line:no-console
      console.log(`Listening on port ${port}`);
    });

  });
