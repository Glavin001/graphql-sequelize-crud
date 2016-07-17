"use strict";

const {
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLInt,
  GraphQLString,
  GraphQLList,
  GraphQLNonNull,
  GraphQLBoolean,
  GraphQLInputObjectType,
  GraphQLID
} = require('graphql');
const _ = require('lodash');
const pluralize = require('pluralize');
const camelcase = require('camelcase');

const {
  fromGlobalId,
  globalIdField,
  mutationWithClientMutationId
} = require("graphql-relay");

const {
  defaultArgs,
  defaultListArgs,
  attributeFields,
  resolver,
  relay: {
    sequelizeNodeInterface,
    sequelizeConnection
  }
} = require("graphql-sequelize");

const jsonType = require("graphql-sequelize/lib/types/jsonType.js");

function connectionNameForAssociation(Model, associationName) {
  return camelcase(`${Model.name}_${associationName}`);
}
function queryName(Model, type) {
  switch (type) {
    case 'findAll': {
      return camelcase(pluralize.plural(Model.name));
    }
    case 'findById': {
      return camelcase(Model.name);
    }
    default: {
      console.warn('Unknown query type: ',type);
      return camelcase(`${type}_${Model.name}`);
    }
  }
}
function mutationName(Model, type) {
  switch (type) {
    case 'create': {
      return camelcase(`${type}_${Model.name}`);
    }
    case 'update': {
      return camelcase(`${type}_${pluralize.plural(Model.name)}`);
    }
    case 'delete': {
      return camelcase(`${type}_${pluralize.plural(Model.name)}`);
    }
    default: {
      console.warn('Unknown mutation type: ',type);
      return camelcase(`${type}_${Model.name}`);
    }
  }
}

function _createRecord({
  mutations,
  Model,
  modelType,
  ModelTypes,
  associationsToModel,
  associationsFromModel,
  cache
}) {

  let createMutationName = mutationName(Model, 'create');
  mutations[createMutationName] = mutationWithClientMutationId({
    name: createMutationName,
    description: `Create ${Model.name} record.`,
    inputFields: () => {
      let fields = attributeFields(Model, {
        commentToDescription: true,
        exclude: [Model.primaryKeyAttribute],
        cache
      });

      // Fix Relay Global ID
      _.each(Object.keys(Model.rawAttributes), (k) => {
        // Check if reference attribute
        let attr = Model.rawAttributes[k];
        if (attr.references) {
          // console.log(`Replacing ${Model.name}'s field ${k} with globalIdField.`);
          let modelName = attr.references.model;
          // let modelType = types[modelName];
          fields[k] = globalIdField(modelName);
        }
      });

      // Remove primaryKey attribute
      // _.assign(fields, attributeFields(Model, {
      //   commentToDescription: true,
      //   only: [Model.primaryKeyAttribute],
      //   allowNull: true,
      //   cache
      // }));

      let globalIdFieldType = globalIdField(Model.name);
      globalIdFieldType.type = GraphQLID;

      // FIXME: Handle timestamps
      delete fields.createdAt;
      delete fields.updatedAt;

      return fields;
    },
    outputFields: () => {
      let output = {};
      // New Record
      output[camelcase(`new_${Model.name}`)] = {
        type: modelType,
        description: `The new ${Model.name}, if successfully created.`,
        resolve: (args,e,context,info) => {
          return resolver(Model, {
            include: false
          })({}, {
            [Model.primaryKeyAttribute]: args[Model.primaryKeyAttribute]
          }, context, info);
        }
      };

      // New Edges
      _.each(associationsToModel[Model.name], (a) => {
        let {
          from,
          type: atype,
          key: field
        } = a;
        // console.log("Edge To", Model.name, "From", from, field, atype);
        if (atype !== "BelongsTo") {
          // HasMany Association
          let {connection} = associationsFromModel[from][`${Model.name}_${field}`];
          let fromType = ModelTypes[from];
          // let nodeType = conn.nodeType;
          // let association = Model.associations[field];
          // let targetType = association
          // console.log("Connection", Model.name, field, nodeType, conn, association);
          output[camelcase(`new_${fromType.name}_${field}_Edge`)] = {
            type: connection.edgeType,
            resolve: (payload) => connection.resolveEdge(payload)
          };
        }
      });
      _.each(associationsFromModel[Model.name], (a) => {
        let {
          to,
          type: atype,
          foreignKey,
          key: field
        } = a;
        // console.log("Edge From", Model.name, "To", to, field, as, atype, foreignKey);
        if (atype === "BelongsTo") {
          // BelongsTo association
          let toType = ModelTypes[to];
          output[field] = {
            type: toType,
            resolve: (args,e,context,info) => {
              return resolver(Models[toType.name], {
                include: false
              })({}, { id: args[foreignKey] }, context, info);
            }
          };
        }
      });

      // console.log(`${Model.name} mutation output`, output);

      return output;
    },
    mutateAndGetPayload: (data) => {

      // Fix Relay Global ID
      _.each(Object.keys(data), (k) => {
        if (k === "clientMutationId") {
          return;
        }
        // Check if reference attribute
        let attr = Model.rawAttributes[k];
        if (attr.references) {
          let {id} = fromGlobalId(data[k]);
          data[k] = parseInt(id);
        }
      });

      return Model.create(data);

    }
  });

}

function _findRecord({
  queries,
  Model,
  modelType
}) {
  let findByIdQueryName = queryName(Model, 'findById'); //`find${Model.name}ById`;
  queries[findByIdQueryName] = {
    type: modelType,
    args: defaultArgs(Model),
    resolve: resolver(Model, {
      include: false // disable auto including of associations based on AST - default: true
    })
  };
}

function _findAll({
  queries,
  Model,
  modelType
}) {
  let findAllQueryName = queryName(Model, 'findAll');
  queries[findAllQueryName] = {
    type: new GraphQLList(modelType),
    args: defaultListArgs(Model),
    // args: {
    //   // An arg with the key limit will automatically be converted to a limit on the target
    //   limit: {
    //     type: GraphQLInt
    //   },
    //   // An arg with the key order will automatically be converted to a order on the target
    //   order: {
    //     type: GraphQLString
    //   }
    // },
    resolve: resolver(Model)
  };
}

function _updateRecord({
  mutations,
  Model,
  modelType,
  ModelTypes,
  associationsToModel,
  associationsFromModel,
  cache
}) {

  let updateMutationName = mutationName(Model, 'update');
  mutations[updateMutationName] = mutationWithClientMutationId({
    name: updateMutationName,
    description: `Update ${Model.name} record.`,
    inputFields: () => {
      let fields = attributeFields(Model, {
        commentToDescription: true,
        allowNull: true,
        cache
      });
      // Fix Relay Global ID
      _.each(Object.keys(Model.rawAttributes), (k) => {
        // Check if reference attribute
        let attr = Model.rawAttributes[k];
        if (attr.references) {
          // console.log(`Replacing ${Model.name}'s field ${k} with globalIdField.`);
          let modelName = attr.references.model;
          // let modelType = types[modelName];
          fields[k] = globalIdField(modelName);
        } else if (attr.primaryKey) {
          fields[k] = globalIdField(Model.name);
          fields[k].type = GraphQLID;
        }
      });

      var UpdateModelValuesType = new GraphQLInputObjectType({
        name: `Update${Model.name}ValuesInput`,
        description: "Values to update",
        fields
      });

      var UpdateModelWhereType = new GraphQLInputObjectType({
        name: `Update${Model.name}WhereInput`,
        description: "Options to describe the scope of the search.",
        // fields: _.assign({
        //   [Model.primaryKeyAttribute]: globalIdField(Model.name)
        // }, fields)
        fields
      });

      return {
        values: {
          type: UpdateModelValuesType
        },
        where: {
          type: UpdateModelWhereType,
        }
      };

    },
    outputFields: () => {
      let output = {};
      // New Record
      output[camelcase(`new_${Model.name}`)] = {
        type: modelType,
        description: `The new ${Model.name}, if successfully created.`,
        resolve: (args,e,context,info) => {
          return resolver(Model, {
            include: false
          })({}, {
            [Model.primaryKeyAttribute]: args[Model.primaryKeyAttribute]
          }, context, info);
        }
      };

      // New Edges
      _.each(associationsToModel[Model.name], (a) => {
        let {
          from,
          type: atype,
          key: field
        } = a;
        // console.log("Edge To", Model.name, "From", from, field, atype);
        if (atype !== "BelongsTo") {
          // HasMany Association
          let {connection} = associationsFromModel[from][`${Model.name}_${field}`];
          let fromType = ModelTypes[from];
          // let nodeType = conn.nodeType;
          // let association = Model.associations[field];
          // let targetType = association
          // console.log("Connection", Model.name, field, nodeType, conn, association);
          output[camelcase(`new_${fromType.name}_${field}_Edge`)] = {
            type: connection.edgeType,
            resolve: (payload) => connection.resolveEdge(payload)
          };
        }
      });
      _.each(associationsFromModel[Model.name], (a) => {
        let {
          to,
          type: atype,
          foreignKey,
          key: field
        } = a;
        // console.log("Edge From", Model.name, "To", to, field, as, atype, foreignKey);
        if (atype === "BelongsTo") {
          // BelongsTo association
          let toType = ModelTypes[to];
          output[field] = {
            type: toType,
            resolve: (args,e,context,info) => {
              return resolver(Models[toType.name], {
                include: false
              })({}, { id: args[foreignKey] }, context, info);
            }
          };
        }
      });

      // console.log(`${Model.name} mutation output`, output);

      let outputType = new GraphQLObjectType({
        name: `Update${Model.name}Output`,
        fields: output
      });

      return {
        'nodes': {
          type: new GraphQLList(outputType),
          resolve: (source, args, context, info) => {
            // console.log('update', source, args);
            return Model.findAll({
              where: source.where
            });
          }
        },
        'affectedCount': {
          type: GraphQLInt
        }
      };
    },
    mutateAndGetPayload: (data) => {
      // console.log('mutate', data);
      let {values, where} = data;

      // Fix Relay Global ID
      _.each(values, (value, k) => {
        // Check if reference attribute
        let attr = Model.rawAttributes[k];
        // console.log(k, value, attr);
        if (attr.references || attr.primaryKey) {
          let {id} = fromGlobalId(value);
          values[k] = parseInt(id);
        }
      });
      _.each(where, (value, k) => {
        // Check if reference attribute
        let attr = Model.rawAttributes[k];
        // console.log(k, value, attr);
        if (attr.references || attr.primaryKey) {
          let {id} = fromGlobalId(value);
          where[k] = parseInt(id);
        }
      });

      return Model.update(values, {
        where
      })
      .then((result) => {
        return {
          where,
          affectedCount: result[0]
        };
      });

    }
  });

}

function _deleteRecord({
  mutations,
  Model,
  modelType,
  ModelTypes,
  associationsToModel,
  associationsFromModel,
  cache
}) {

  let deleteMutationName = mutationName(Model, 'delete');
  mutations[deleteMutationName] = mutationWithClientMutationId({
    name: deleteMutationName,
    description: `Delete ${Model.name} record.`,
    inputFields: () => {
      let fields = attributeFields(Model, {
        commentToDescription: true,
        allowNull: true,
        cache
      });
      // Fix Relay Global ID
      _.each(Object.keys(Model.rawAttributes), (k) => {
        // Check if reference attribute
        let attr = Model.rawAttributes[k];
        if (attr.references) {
          // console.log(`Replacing ${Model.name}'s field ${k} with globalIdField.`);
          let modelName = attr.references.model;
          // let modelType = types[modelName];
          fields[k] = globalIdField(modelName);
        }
      });
      return fields;
    },
    outputFields: () => {
      let output = {};
      // New Record
      output[camelcase(`new_${Model.name}`)] = {
        type: modelType,
        description: `The new ${Model.name}, if successfully created.`,
        resolve: (args,e,context,info) => {
          return resolver(Model, {
            include: false
          })({}, {
            [Model.primaryKeyAttribute]: args[Model.primaryKeyAttribute]
          }, context, info);
        }
      };

      // New Edges
      _.each(associationsToModel[Model.name], (a) => {
        let {
          from,
          type: atype,
          key: field
        } = a;
        // console.log("Edge To", Model.name, "From", from, field, atype);
        if (atype !== "BelongsTo") {
          // HasMany Association
          let {connection} = associationsFromModel[from][`${Model.name}_${field}`];
          let fromType = ModelTypes[from];
          // let nodeType = conn.nodeType;
          // let association = Model.associations[field];
          // let targetType = association
          // console.log("Connection", Model.name, field, nodeType, conn, association);
          output[camelcase(`new_${fromType.name}_${field}_Edge`)] = {
            type: connection.edgeType,
            resolve: (payload) => connection.resolveEdge(payload)
          };
        }
      });
      _.each(associationsFromModel[Model.name], (a) => {
        let {
          to,
          type: atype,
          foreignKey,
          key: field
        } = a;
        // console.log("Edge From", Model.name, "To", to, field, as, atype, foreignKey);
        if (atype === "BelongsTo") {
          // BelongsTo association
          let toType = ModelTypes[to];
          output[field] = {
            type: toType,
            resolve: (args,e,context,info) => {
              return resolver(Models[toType.name], {
                include: false
              })({}, { id: args[foreignKey] }, context, info);
            }
          };
        }
      });

      // console.log(`${Model.name} mutation output`, output);

      return output;
    },
    mutateAndGetPayload: (data) => {

      // Fix Relay Global ID
      _.each(Object.keys(data), (k) => {
        if (k === "clientMutationId") {
          return;
        }
        // Check if reference attribute
        let attr = Model.rawAttributes[k];
        if (attr.references) {
          let {id} = fromGlobalId(data[k]);
          data[k] = parseInt(id);
        }
      });

      return Model.create(data);

    }
  });

}

function getSchema(sequelize) {

  const {nodeInterface, nodeField, nodeTypeMapper} = sequelizeNodeInterface(sequelize);

  const Models = sequelize.models;
  const queries = {};
  const mutations = {};
  const associationsToModel = {};
  const associationsFromModel = {};
  const cache = {};

  // Create types map
  const ModelTypes = Object.keys(Models).reduce(function (types, key) {
    const Model = Models[key];
    const modelType = new GraphQLObjectType({
      name: Model.name,
      fields: () => {
        // Lazily load fields
        return Object.keys(Model.associations).reduce((fields,akey) => {
          let association = Model.associations[akey];
          let atype = association.associationType;
          let target = association.target;
          let targetType = ModelTypes[target.name];
          if (atype === "BelongsTo") {
            fields[akey] = {
              type: targetType,
              resolve: resolver(association, {
                separate: true
              })
            };
          } else {
            const connectionName = connectionNameForAssociation(Model, akey);
            const connection = ModelTypes[connectionName];
            fields[akey] = {
              type: connection.connectionType,
              args: connection.connectionArgs,
              resolve: connection.resolve
            };
          }
          return fields;
        },
          // Attribute fields
          attributeFields(Model, {
            globalId: true,
            commentToDescription: true,
            cache
          })
        );
      },
      interfaces: [nodeInterface]
    });
    types[Model.name] = modelType;
    // === CRUD ====
    // CREATE single
    _createRecord({
      mutations,
      Model,
      modelType,
      ModelTypes: types,
      associationsToModel,
      associationsFromModel,
      cache
    });

    // READ single
    _findRecord({
      queries,
      Model,
      modelType
    });

    // READ all
    _findAll({
      queries,
      Model,
      modelType
    });

    // UPDATE single
    _updateRecord({
      mutations,
      Model,
      modelType,
      ModelTypes: types,
      associationsToModel,
      associationsFromModel,
      cache
    });

    // DELETE single
    _deleteRecord({
      mutations,
      Model,
      modelType,
      ModelTypes: types,
      associationsToModel,
      associationsFromModel,
      cache
    });

    return types;
  }, {});

  // Create Connections
  _.each(Models, (Model) => {
    _.each(Model.associations, (association, akey) => {

      let atype = association.associationType;
      let target = association.target;
      let foreignKey = association.foreignKey;
      let as = association.as;
      let targetType = ModelTypes[target.name];
      const connectionName = connectionNameForAssociation(Model, akey);
      if (atype === "BelongsTo") {
        // BelongsTo
        _.set(associationsToModel, `${targetType.name}.${akey}`, {
          from: Model.name,
          type: atype,
          key: akey,
          foreignKey,
          as
        });
        _.set(associationsFromModel, `${Model.name}.${akey}`, {
          to: targetType.name,
          type: atype,
          key: akey,
          foreignKey,
          as
        });
      } else {
        // HasMany
        let edgeFields = {};
        if (atype === "BelongsToMany") {
          let aModel = association.through.model;
          // console.log('BelongsToMany model', aModel);
          edgeFields = attributeFields(aModel, {
            globalId: true,
            commentToDescription: true,
            cache
          });
          // Pass Through model to resolve function
          _.each(edgeFields, (edgeField, field) => {
            let oldResolve = edgeField.resolve;
            // console.log(field, edgeField, Object.keys(edgeField));
            if (typeof oldResolve !== 'function') {
              // console.log(oldResolve);
              let resolve = (source, args, context, info) => {
                let e = source.node[aModel.name];
                return e[field];
              };
              edgeField.resolve = resolve.bind(edgeField);
            } else {
              let resolve = (source, args, context, info) => {
                let e = source.node[aModel.name];
                return oldResolve(e, args, context, info);
              };
              edgeField.resolve = resolve.bind(edgeField);
            }
          });
        }

        const connection = sequelizeConnection({
          name: connectionName,
          nodeType: targetType,
          target: association,
          connectionFields: {
            total: {
              type: new GraphQLNonNull(GraphQLInt),
              description: `Total count of ${targetType.name} results associated with ${Model.name}.`,
              resolve({source}) {
                let {accessors} = association;
                return source[accessors.count]();
              }
            }
          },
          edgeFields
        });
        ModelTypes[connectionName] = connection;
        _.set(associationsToModel, `${targetType.name}.${Model.name}_${akey}`, {
          from: Model.name,
          type: atype,
          key: akey,
          connection,
          as
        });
        _.set(associationsFromModel, `${Model.name}.${targetType.name}_${akey}`, {
          to: targetType.name,
          type: atype,
          key: akey,
          connection,
          as
        });
      }

    });
  });
  // console.log("associationsToModel", associationsToModel);
  // console.log("associationsFromModel", associationsFromModel);


  // Custom Queries and Mutations
  _.each(Object.keys(Models), (key) => {
    const Model = Models[key];

    // Custom Queries
    if (Model.queries) {
      _.assign(queries, Model.queries(Models, ModelTypes, resolver));
    }
    // Custom Mutations
    if (Model.mutations) {
      _.assign(mutations, Model.mutations(Models, ModelTypes, resolver));
    }

  });

  // Configure NodeTypeMapper
  nodeTypeMapper.mapTypes({
    ...ModelTypes
  });

  const Queries = new GraphQLObjectType({
    name: "Root",
    description: "Root of the Schema",
    fields: () => ({
      root: {
        // Cite: https://github.com/facebook/relay/issues/112#issuecomment-170648934
        type: new GraphQLNonNull(Queries),
        description: "Self-Pointer from Root to Root",
        resolve: () => ({})
      },
      ...queries,
      node: nodeField
    })
  });

  const Mutations = new GraphQLObjectType({
    name: "Mutations",
    fields: {
      ...mutations
    }
  });

  return new GraphQLSchema({
    query: Queries,
    mutation: Mutations
  });

};

module.exports = {
  getSchema
};
