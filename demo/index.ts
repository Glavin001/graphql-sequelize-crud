'use strict';

import {
  graphql,
  GraphQLSchema,
  GraphQLString,
  GraphQLNonNull,
  GraphQLObjectType,
} from 'graphql';
import * as Sequelize from 'sequelize';
import * as express from 'express';
import * as graphqlHTTP from 'express-graphql';
import { ModelsHashInterface as Models } from "sequelize";
import { resolver } from "graphql-sequelize";
import {
  getSchema,
  IModelTypes,
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
      queries: function () {
        return {};
      },
      mutations: (Models: Models, ModelTypes: IModelTypes, resolver: Function) => {
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
                "customValueA": dataA,
                "customValueB": dataB,
              });
            }
          }
        };
      }
    }
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
      schema: schema,
      graphiql: true
    }));

    const port = 3000;
    app.listen(port, () => {
      console.log(`Listening on port ${port}`);
    });

  });
