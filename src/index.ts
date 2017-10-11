"use strict";

import {
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLInt,
  GraphQLString,
  GraphQLList,
  GraphQLNonNull,
  GraphQLBoolean,
  GraphQLInputObjectType,
  GraphQLID,
  GraphQLFieldConfigMap,
  GraphQLFieldResolver,
} from 'graphql';
import * as _ from 'lodash';
import * as pluralize from 'pluralize';
import * as camelcase from 'camelcase';

import {
  fromGlobalId,
  globalIdField,
  mutationWithClientMutationId
} from "graphql-relay";

import {
  defaultArgs,
  defaultListArgs,
  attributeFields,
  resolver,
  relay,
  SequelizeConnection,
} from "graphql-sequelize";
const {
  sequelizeNodeInterface,
  sequelizeConnection
} = relay;

import { Sequelize, Model as SequelizeModel } from "sequelize";
// export type Model = SequelizeModel<any, any>
export type Model = any;

import * as jsonType from "graphql-sequelize/lib/types/jsonType";

function getTableName(Model: Model): string {
  return (<any>Model).name;
  // const tableName = Model.getTableName();
  // if (typeof tableName === "string") {
  //   return tableName;
  // }
  // return (<any> tableName).tableName;
}

function attributesForModel(Model: Model): { [key: string]: any; } {
  return (<any>Model).rawAttributes;
}

function connectionNameForAssociation(Model: Model, associationName: string) {
  return camelcase(`${getTableName(Model)}_${associationName}`);
}

function queryName(Model: Model, type: string) {
  switch (type) {
    case 'findAll': {
      return camelcase(pluralize.plural(getTableName(Model)));
    }
    case 'findById': {
      return camelcase(getTableName(Model));
    }
    default: {
      console.warn('Unknown query type: ', type);
      return camelcase(`${type}_${getTableName(Model)}`);
    }
  }
}
function mutationName(Model: Model, type: string) {
  switch (type) {
    case 'create': {
      return camelcase(`${type}_${getTableName(Model)}`);
    }
    case 'update': {
      return camelcase(`${type}_${pluralize.plural(getTableName(Model))}`);
    }
    case 'updateOne': {
      return camelcase(`update_${getTableName(Model)}`);
    }
    case 'delete': {
      return camelcase(`${type}_${pluralize.plural(getTableName(Model))}`);
    }
    case 'deleteOne': {
      return camelcase(`delete_${getTableName(Model)}`);
    }
    default: {
      console.warn('Unknown mutation type: ', type);
      return camelcase(`${type}_${getTableName(Model)}`);
    }
  }
}

function convertFieldsToGlobalId(Model: Model, fields: Fields) {
  // Fix Relay Global ID
  const rawAttributes = attributesForModel(Model);
  _.each(Object.keys(rawAttributes), (k) => {
    if (k === "clientMutationId") {
      return;
    }
    // Check if reference attribute
    let attr = rawAttributes[k];
    if (attr.references) {
      // console.log(`Replacing ${getTableName(Model)}'s field ${k} with globalIdField.`);
      let modelName = attr.references.model;
      // let modelType = types[modelName];
      fields[k] = globalIdField(modelName);
    } else if (attr.primaryKey) {
      fields[k] = globalIdField(getTableName(Model));
      // Make primaryKey optional (allowNull=True)
      fields[k].type = GraphQLID;
    }
  });
}

function convertFieldsFromGlobalId(Model: Model, data: { [key: string]: any; }) {
  // Fix Relay Global ID
  const rawAttributes = attributesForModel(Model);
  _.each(Object.keys(data), (k) => {
    if (k === "clientMutationId") {
      return;
    }
    // Check if reference attribute
    let attr: any = rawAttributes[k];
    if (attr.references || attr.primaryKey) {
      let { id } = fromGlobalId(data[k]);

      // Check if id is numeric.
      if (!_.isNaN(_.toNumber(id))) {
        data[k] = parseInt(id);
      } else {
        data[k] = id;
      }
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
  cache,
  Models,
}: OperationOptions) {

  let createMutationName = mutationName(Model, 'create');
  mutations[createMutationName] = mutationWithClientMutationId({
    name: createMutationName,
    description: `Create ${getTableName(Model)} record.`,
    inputFields: () => {
      const exclude: any[] = (<any>Model).excludeFields ? (<any>Model).excludeFields : [];
      let fields = attributeFields(Model, {
        exclude,
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
      let output: GraphQLFieldConfigMap<any, any> = {};
      // New Record
      output[camelcase(`new_${getTableName(Model)}`)] = {
        type: modelType,
        description: `The new ${getTableName(Model)}, if successfully created.`,
        resolve: (args: any, e: any, context: any, info: any) => {
          return resolver(Model, {
          })({}, {
            [Model.primaryKeyAttribute]: args[Model.primaryKeyAttribute]
          }, context, info);
        }
      };

      // New Edges
      _.each(associationsToModel[getTableName(Model)], (a) => {
        let {
          from,
          type: atype,
          key: field
        } = a;
        // console.log("Edge To", getTableName(Model), "From", from, field, atype);
        if (atype !== "BelongsTo") {
          // HasMany Association
          let { connection } = associationsFromModel[from][`${getTableName(Model)}_${field}`];
          let fromType = ModelTypes[from];
          // let nodeType = conn.nodeType;
          // let association = Model.associations[field];
          // let targetType = association
          // console.log("Connection", getTableName(Model), field, nodeType, conn, association);
          output[camelcase(`new_${fromType.name}_${field}_Edge`)] = {
            type: connection.edgeType,
            resolve: (payload: any) => connection.resolveEdge(payload)
          };
        }
      });
      _.each(associationsFromModel[getTableName(Model)], (a) => {
        let {
          to,
          type: atype,
          foreignKey,
          key: field
        } = a;
        // console.log("Edge From", getTableName(Model), "To", to, field, as, atype, foreignKey);
        if (atype === "BelongsTo") {
          // BelongsTo association
          let toType = ModelTypes[to];
          output[field] = {
            type: toType,
            resolve: (args: any, e: any, context: any, info: any) => {
              console.log('Models', Models, Models[toType.name]);
              return resolver(Models[toType.name], {
              })({}, { id: args[foreignKey] }, context, info);
            }
          };
        }
      });
      // console.log(`${getTableName(Model)} mutation output`, output);
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
}: FindOperationOptions) {
  let findByIdQueryName = queryName(Model, 'findById'); //`find${getTableName(Model)}ById`;
  queries[findByIdQueryName] = {
    type: modelType,
    args: defaultArgs(Model),
    resolve: resolver(Model, {
    })
  };
}

function _findAll({
  queries,
  Model,
  modelType
}: FindOperationOptions) {
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
  cache,
  Models,  
}: OperationOptions) {

  let updateMutationName = mutationName(Model, 'update');
  mutations[updateMutationName] = mutationWithClientMutationId({
    name: updateMutationName,
    description: `Update multiple ${getTableName(Model)} records.`,
    inputFields: () => {
      let fields = attributeFields(Model, {
        exclude: Model.excludeFields ? Model.excludeFields : [],
        commentToDescription: true,
        allowNull: true,
        cache
      });

      convertFieldsToGlobalId(Model, fields);

      let updateModelTypeName = `Update${getTableName(Model)}ValuesInput`;
      let UpdateModelValuesType = cache[updateModelTypeName] || new GraphQLInputObjectType({
        name: updateModelTypeName,
        description: "Values to update",
        fields
      });
      cache[updateModelTypeName] = UpdateModelValuesType;

      var UpdateModelWhereType = new GraphQLInputObjectType({
        name: `Update${getTableName(Model)}WhereInput`,
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
      let output: GraphQLFieldConfigMap<any, any> = {};
      // New Record
      output[camelcase(`new_${getTableName(Model)}`)] = {
        type: modelType,
        description: `The new ${getTableName(Model)}, if successfully created.`,
        resolve: (args: any, e: any, context: any, info: any) => {
          return resolver(Model, {
          })({}, {
            [Model.primaryKeyAttribute]: args[Model.primaryKeyAttribute]
          }, context, info);
        }
      };

      // New Edges
      _.each(associationsToModel[getTableName(Model)], (a) => {
        let {
          from,
          type: atype,
          key: field
        } = a;
        // console.log("Edge To", getTableName(Model), "From", from, field, atype);
        if (atype !== "BelongsTo") {
          // HasMany Association
          let { connection } = associationsFromModel[from][`${getTableName(Model)}_${field}`];
          let fromType = ModelTypes[from];
          // console.log("Connection", getTableName(Model), field, nodeType, conn, association);
          output[camelcase(`new_${fromType.name}_${field}_Edge`)] = {
            type: connection.edgeType,
            resolve: (payload) => connection.resolveEdge(payload)
          };
        }
      });
      _.each(associationsFromModel[getTableName(Model)], (a) => {
        let {
          to,
          type: atype,
          foreignKey,
          key: field
        } = a;
        // console.log("Edge From", getTableName(Model), "To", to, field, as, atype, foreignKey);
        if (atype === "BelongsTo") {
          // BelongsTo association
          let toType = ModelTypes[to];
          output[field] = {
            type: toType,
            resolve: (args: any, e: any, context: any, info: any) => {
              console.log('Models', Models, Models[toType.name]);
              return resolver(Models[toType.name], {
              })({}, { id: args[foreignKey] }, context, info);
            }
          };
        }
      });
      // console.log(`${getTableName(Model)} mutation output`, output);
      let updateModelOutputTypeName = `Update${getTableName(Model)}Output`;
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
      let { values, where } = data;
      convertFieldsFromGlobalId(Model, values);
      convertFieldsFromGlobalId(Model, where);
      return Model.update(values, {
        where
      })
        .then((result: any[]) => {
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
  cache,
  Models,  
}: OperationOptions) {

  let updateMutationName = mutationName(Model, 'updateOne');
  mutations[updateMutationName] = mutationWithClientMutationId({
    name: updateMutationName,
    description: `Update a single ${getTableName(Model)} record.`,
    inputFields: () => {
      let fields = attributeFields(Model, {
        exclude: Model.excludeFields ? Model.excludeFields : [],
        commentToDescription: true,
        allowNull: true,
        cache
      });

      convertFieldsToGlobalId(Model, fields);

      let updateModelInputTypeName = `Update${getTableName(Model)}ValuesInput`;
      let UpdateModelValuesType = cache[updateModelInputTypeName] || new GraphQLInputObjectType({
        name: updateModelInputTypeName,
        description: "Values to update",
        fields
      });
      cache[updateModelInputTypeName] = UpdateModelValuesType;

      return {
        [Model.primaryKeyAttribute]: globalIdField(getTableName(Model)),
        values: {
          type: UpdateModelValuesType
        }
      } as any;

    },
    outputFields: () => {
      let output: GraphQLFieldConfigMap<any, any> = {};
      // New Record
      output[camelcase(`new_${getTableName(Model)}`)] = {
        type: modelType,
        description: `The new ${getTableName(Model)}, if successfully created.`,
        resolve: (args, e, context, info) => {
          return resolver(Model, {
          })({}, {
            [Model.primaryKeyAttribute]: args[Model.primaryKeyAttribute]
          }, context, info);
        }
      };

      // New Edges
      _.each(associationsToModel[getTableName(Model)], (a) => {
        let {
          from,
          type: atype,
          key: field
        } = a;
        // console.log("Edge To", getTableName(Model), "From", from, field, atype);
        if (atype !== "BelongsTo") {
          // HasMany Association
          let { connection } = associationsFromModel[from][`${getTableName(Model)}_${field}`];
          let fromType = ModelTypes[from];
          // console.log("Connection", getTableName(Model), field, nodeType, conn, association);
          output[camelcase(`new_${fromType.name}_${field}_Edge`)] = {
            type: connection.edgeType,
            resolve: (payload) => connection.resolveEdge(payload)
          };
        }
      });
      _.each(associationsFromModel[getTableName(Model)], (a) => {
        let {
          to,
          type: atype,
          foreignKey,
          key: field
        } = a;
        // console.log("Edge From", getTableName(Model), "To", to, field, as, atype, foreignKey);
        if (atype === "BelongsTo") {
          // BelongsTo association
          let toType = ModelTypes[to];
          output[field] = {
            type: toType,
            resolve: (args, e, context, info) => {
              console.log('Models', Models, Models[toType.name]);
              return resolver(Models[toType.name], {
              })({}, { id: args[foreignKey] }, context, info);
            }
          };
        }
      });
      // console.log(`${getTableName(Model)} mutation output`, output);

      let updateModelOutputTypeName = `Update${getTableName(Model)}Output`;
      let outputType = cache[updateModelOutputTypeName] || new GraphQLObjectType({
        name: updateModelOutputTypeName,
        fields: output
      });
      cache[updateModelOutputTypeName] = outputType;

      return output;

    },
    mutateAndGetPayload: (data) => {
      // console.log('mutate', data);
      let { values } = data;
      let where = {
        [Model.primaryKeyAttribute]: data[Model.primaryKeyAttribute]
      };
      convertFieldsFromGlobalId(Model, values);
      convertFieldsFromGlobalId(Model, where);

      return Model.update(values, {
        where
      })
        .then((result: any) => {
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
}: OperationOptions) {

  let deleteMutationName = mutationName(Model, 'delete');
  mutations[deleteMutationName] = mutationWithClientMutationId({
    name: deleteMutationName,
    description: `Delete ${getTableName(Model)} records.`,
    inputFields: () => {
      let fields = attributeFields(Model, {
        exclude: Model.excludeFields ? Model.excludeFields : [],
        commentToDescription: true,
        allowNull: true,
        cache
      });
      convertFieldsToGlobalId(Model, fields);
      var DeleteModelWhereType = new GraphQLInputObjectType({
        name: `Delete${getTableName(Model)}WhereInput`,
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
      let { where } = data;
      convertFieldsFromGlobalId(Model, where);
      return Model.destroy({
        where
      })
        .then((affectedCount: any[]) => {
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
}: OperationOptions) {

  let deleteMutationName = mutationName(Model, 'deleteOne');
  mutations[deleteMutationName] = mutationWithClientMutationId({
    name: deleteMutationName,
    description: `Delete single ${getTableName(Model)} record.`,
    inputFields: () => {
      return {
        [Model.primaryKeyAttribute]: globalIdField(getTableName(Model)),
      } as any;
    },
    outputFields: () => {
      let idField = camelcase(`deleted_${getTableName(Model)}_id`);
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
        .then((affectedCount: any[]) => {
          return data;
        });
    }
  });

}

interface IModelTypes {
  [tableName: string]: GraphQLObjectType | SequelizeConnection;
}

function getSchema(sequelize: Sequelize) {

  const { nodeInterface, nodeField, nodeTypeMapper } = sequelizeNodeInterface(sequelize);

  const Models = sequelize.models;
  const queries: Queries = {};
  const mutations: any = {};
  const associationsToModel: AssociationToModels = {};
  const associationsFromModel: AssociationFromModels = {};
  const cache: any = {};

  // Create types map
  const ModelTypes: IModelTypes = Object.keys(Models).reduce(function (types: IModelTypes, key: string) {
    const Model: Model = Models[key];
    const modelType = new GraphQLObjectType({
      name: getTableName(Model),
      fields: () => {
        // Lazily load fields
        return Object.keys(Model.associations).reduce((fields: GraphQLFieldConfigMap<any, any>, akey: string) => {
          let association = Model.associations[akey];
          let atype = association.associationType;
          let target = association.target;
          let targetType = ModelTypes[target.name];
          if (atype === "BelongsTo") {
            fields[akey] = {
              type: targetType as GraphQLObjectType,
              resolve: resolver(association, {
                separate: true
              })
            };
          } else {
            const connectionName = connectionNameForAssociation(Model, akey);
            const connection = ModelTypes[connectionName] as any;
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
            exclude: Model.excludeFields ? Model.excludeFields : [],
            globalId: true,
            commentToDescription: true,
            cache
          })
        );
      },
      interfaces: [nodeInterface]
    });
    types[getTableName(Model)] = modelType;
    // === CRUD ====
    // CREATE single
    _createRecord({
      mutations,
      Model,
      modelType,
      ModelTypes: types,
      associationsToModel,
      associationsFromModel,
      cache,
      Models,
    });

    // READ single
    _findRecord({
      queries,
      Model,
      modelType,
      Models,
    });

    // READ all
    _findAll({
      queries,
      Model,
      modelType,
      Models,      
    });

    // UPDATE single
    _updateRecord({
      mutations,
      Model,
      modelType,
      ModelTypes: types,
      associationsToModel,
      associationsFromModel,
      cache,
      Models,      
    });

    // UPDATE multiple
    _updateRecords({
      mutations,
      Model,
      modelType,
      ModelTypes: types,
      associationsToModel,
      associationsFromModel,
      cache,
      Models,      
    });

    // DELETE single
    _deleteRecord({
      mutations,
      Model,
      modelType,
      ModelTypes: types,
      associationsToModel,
      associationsFromModel,
      cache,
      Models,      
    });

    _deleteRecords({
      mutations,
      Model,
      modelType,
      ModelTypes: types,
      associationsToModel,
      associationsFromModel,
      cache,
      Models,      
    });

    return types;
  }, {});

  // Create Connections
  _.each(Models, (Model: Model) => {
    _.each(Model.associations, (association: Association, akey: string) => {

      let atype = association.associationType;
      let target = association.target;
      let foreignKey = association.foreignKey;
      let as = association.as;
      let targetType = ModelTypes[target.name] as GraphQLObjectType;
      const connectionName = connectionNameForAssociation(Model, akey);
      if (atype === "BelongsTo") {
        // BelongsTo
        _.set(associationsToModel, `${targetType.name}.${akey}`, {
          from: getTableName(Model),
          type: atype,
          key: akey,
          foreignKey,
          as
        });
        _.set(associationsFromModel, `${getTableName(Model)}.${akey}`, {
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
            exclude: aModel.excludeFields ? aModel.excludeFields : [],
            globalId: true,
            commentToDescription: true,
            cache
          });
          // Pass Through model to resolve function
          _.each(edgeFields, (edgeField: any, field: string) => {
            let oldResolve: GraphQLFieldResolver<any, any> = edgeField.resolve;
            // console.log(field, edgeField, Object.keys(edgeField));
            if (typeof oldResolve !== 'function') {
              // console.log(oldResolve);
              let resolve: GraphQLFieldResolver<any, any> = (source, args, context, info) => {
                let e = source.node[getTableName(aModel)];
                return e[field];
              };
              edgeField.resolve = resolve.bind(edgeField);
            } else {
              let resolve: GraphQLFieldResolver<any, any> = (source, args, context, info) => {
                let e = source.node[getTableName(aModel)];
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
              description: `Total count of ${targetType.name} results associated with ${getTableName(Model)}.`,
              resolve({ source }: any) {
                let { accessors } = association;
                return source[accessors.count]();
              }
            }
          },
          edgeFields
        });
        ModelTypes[connectionName] = connection;
        _.set(associationsToModel, `${targetType.name}.${getTableName(Model)}_${akey}`, {
          from: getTableName(Model),
          type: atype,
          key: akey,
          connection,
          as
        });
        _.set(associationsFromModel, `${getTableName(Model)}.${targetType.name}_${akey}`, {
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
    const Model: any = Models[key];

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

  const Queries: GraphQLObjectType = new GraphQLObjectType({
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

export interface Association { 
  associationType: string;
  target: {
    name: string;
  };
  foreignKey: string;
  as: string;
  through: {
    model: Model;
  };
  accessors: {
    count: any;
  };
}

export interface AssociationToModel {
  from: string;
  type: string;
  key: string;
  connection: SequelizeConnection;
  as: any;
}

export interface AssociationToModels {
  [tableName: string]: {
    [fieldName: string]: AssociationToModel;
  };
}

export interface AssociationFromModel {
  to: string;
  type: string;
  foreignKey: string;
  key: string;
  connection: SequelizeConnection;
  as: any;
}

export interface AssociationFromModels {
  [tableName: string]: {
    [fieldName: string]: AssociationFromModel;
  };
}

export interface FindOperationOptions {
  Model: Model;
  modelType: any;
  queries: Queries;
  Models: Sequelize["models"];
}

export interface OperationOptions {
  mutations: any;
  Model: Model;
  modelType: any;
  ModelTypes: any;
  associationsToModel: AssociationToModels;
  associationsFromModel: AssociationFromModels;
  cache: any;
  Models: Sequelize["models"];  
}

export interface Queries {
  [queryName: string]: Query;
}

export interface Query {
  type: any;
  args: any,
  resolve: any;
}

interface Fields {
  [key: string]: any;
}

export {
  getSchema
};
