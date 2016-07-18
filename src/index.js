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
    case 'updateOne': {
      return camelcase(`update_${Model.name}`);
    }
    case 'delete': {
      return camelcase(`${type}_${pluralize.plural(Model.name)}`);
    }
    case 'deleteOne': {
      return camelcase(`delete_${Model.name}`);
    }
    default: {
      console.warn('Unknown mutation type: ',type);
      return camelcase(`${type}_${Model.name}`);
    }
  }
}

function convertFieldsToGlobalId(Model, fields) {
  // Fix Relay Global ID
  _.each(Object.keys(Model.rawAttributes), (k) => {
    if (k === "clientMutationId") {
      return;
    }
    // Check if reference attribute
    let attr = Model.rawAttributes[k];
    if (attr.references) {
      // console.log(`Replacing ${Model.name}'s field ${k} with globalIdField.`);
      let modelName = attr.references.model;
      // let modelType = types[modelName];
      fields[k] = globalIdField(modelName);
    } else if (attr.primaryKey) {
      fields[k] = globalIdField(Model.name);
      // Make primaryKey optional (allowNull=True)
      fields[k].type = GraphQLID;
    }
  });
}

function convertFieldsFromGlobalId(Model, data) {
  // Fix Relay Global ID
  _.each(Object.keys(data), (k) => {
    if (k === "clientMutationId") {
      return;
    }
    // Check if reference attribute
    let attr = Model.rawAttributes[k];
    if (attr.references || attr.primaryKey) {
      let {id} = fromGlobalId(data[k]);
      data[k] = parseInt(id);
    }
  });
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
        // exclude: [Model.primaryKeyAttribute],
        cache
      });

      convertFieldsToGlobalId(Model, fields);

      // FIXME: Handle timestamps
      // console.log('_timestampAttributes', Model._timestampAttributes);
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
      convertFieldsFromGlobalId(Model, data);
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
    resolve: resolver(Model)
  };
}

function _updateRecords({
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
    description: `Update multiple ${Model.name} records.`,
    inputFields: () => {
      let fields = attributeFields(Model, {
        commentToDescription: true,
        allowNull: true,
        cache
      });

      convertFieldsToGlobalId(Model, fields);

      let updateModelTypeName = `Update${Model.name}ValuesInput`;
      let UpdateModelValuesType = cache[updateModelTypeName] || new GraphQLInputObjectType({
        name: updateModelTypeName,
        description: "Values to update",
        fields
      });
      cache[updateModelTypeName] = UpdateModelValuesType;

      var UpdateModelWhereType = new GraphQLInputObjectType({
        name: `Update${Model.name}WhereInput`,
        description: "Options to describe the scope of the search.",
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
      let updateModelOutputTypeName = `Update${Model.name}Output`;
      let outputType = cache[updateModelOutputTypeName] || new GraphQLObjectType({
        name: updateModelOutputTypeName,
        fields: output
      });
      cache[updateModelOutputTypeName] = outputType;

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
      convertFieldsFromGlobalId(Model, values);
      convertFieldsFromGlobalId(Model, where);
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

function _updateRecord({
  mutations,
  Model,
  modelType,
  ModelTypes,
  associationsToModel,
  associationsFromModel,
  cache
}) {

  let updateMutationName = mutationName(Model, 'updateOne');
  mutations[updateMutationName] = mutationWithClientMutationId({
    name: updateMutationName,
    description: `Update a single ${Model.name} record.`,
    inputFields: () => {
      let fields = attributeFields(Model, {
        commentToDescription: true,
        allowNull: true,
        cache
      });

      convertFieldsToGlobalId(Model, fields);

      let updateModelInputTypeName = `Update${Model.name}ValuesInput`;
      let UpdateModelValuesType = cache[updateModelInputTypeName] || new GraphQLInputObjectType({
        name: updateModelInputTypeName,
        description: "Values to update",
        fields
      });
      cache[updateModelInputTypeName] = UpdateModelValuesType;

      return {
        [Model.primaryKeyAttribute]: globalIdField(Model.name),
        values: {
          type: UpdateModelValuesType
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

      let updateModelOutputTypeName = `Update${Model.name}Output`;
      let outputType = cache[updateModelOutputTypeName] || new GraphQLObjectType({
        name: updateModelOutputTypeName,
        fields: output
      });
      cache[updateModelOutputTypeName] = outputType;

      return output;

    },
    mutateAndGetPayload: (data) => {
      // console.log('mutate', data);
      let {values} = data;
      let where = {
        [Model.primaryKeyAttribute]: data[Model.primaryKeyAttribute]
      };
      convertFieldsFromGlobalId(Model, values);
      convertFieldsFromGlobalId(Model, where);

      return Model.update(values, {
        where
      })
      .then((result) => {
        return where;
      });

    }
  });

}


function _deleteRecords({
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
    description: `Delete ${Model.name} records.`,
    inputFields: () => {
      let fields = attributeFields(Model, {
        commentToDescription: true,
        allowNull: true,
        cache
      });
      convertFieldsToGlobalId(Model, fields);
      var DeleteModelWhereType = new GraphQLInputObjectType({
        name: `Delete${Model.name}WhereInput`,
        description: "Options to describe the scope of the search.",
        fields
      });
      return {
        where: {
          type: DeleteModelWhereType,
        }
      };
    },
    outputFields: () => {
      return {
        'affectedCount': {
          type: GraphQLInt
        }
      };
    },
    mutateAndGetPayload: (data) => {
      let {where} = data;
      convertFieldsFromGlobalId(Model, where);
      return Model.destroy({
        where
      })
      .then((affectedCount) => {
        return {
          where,
          affectedCount
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

  let deleteMutationName = mutationName(Model, 'deleteOne');
  mutations[deleteMutationName] = mutationWithClientMutationId({
    name: deleteMutationName,
    description: `Delete single ${Model.name} record.`,
    inputFields: () => {
      return {
        [Model.primaryKeyAttribute]: globalIdField(Model.name),
      };
    },
    outputFields: () => {
      let idField = camelcase(`deleted_${Model.name}_id`);
      return {
        [idField]: {
          type: GraphQLID,
          resolve(source) {
            return source[Model.primaryKeyAttribute];
          }
        }
      };
    },
    mutateAndGetPayload: (data) => {
      let where = {
        [Model.primaryKeyAttribute]: data[Model.primaryKeyAttribute]
      };
      convertFieldsFromGlobalId(Model, where);
      return Model.destroy({
        where
      })
      .then((affectedCount) => {
        return data;
      });
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

    // UPDATE multiple
    _updateRecords({
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

    _deleteRecords({
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
