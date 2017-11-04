// tslint:disable-next-line:no-reference
/// <reference path="./@types/graphql-sequelize/index.d.ts" />

import {
    GraphQLObjectType,
    GraphQLInt,
    GraphQLInputObjectType,
    GraphQLID,
    GraphQLFieldConfigMap,
    GraphQLFieldConfig,
    GraphQLInputFieldConfigMap,
} from 'graphql';
import * as _ from 'lodash';
import * as camelcase from 'camelcase';
import {
    mutationWithClientMutationId
} from "graphql-relay";
import {
    defaultArgs,
    defaultListArgs,
    attributeFields,
    resolver,
    SequelizeConnection,
    Cache,
} from "graphql-sequelize-teselagen";
import {
    convertFieldsFromGlobalId,
    mutationName,
    getTableName,
    convertFieldsToGlobalId,
    queryName,
    globalIdInputField,
    createNonNullList,
    createNonNullListResolver,
} from "./utils";
import {
    Model,
    ModelsHashInterface as Models,
    ModelTypes,
} from "./types";

export class OperationFactory {

    private models: Models;
    private modelTypes: ModelTypes;
    private associationsToModel: AssociationToModels;
    private associationsFromModel: AssociationFromModels;
    private cache: Cache;

    constructor(config: OperationFactoryConfig) {
        this.models = config.models;
        this.modelTypes = config.modelTypes;
        this.associationsToModel = config.associationsToModel;
        this.associationsFromModel = config.associationsFromModel;
        this.cache = config.cache;
    }

    public createRecord({
        mutations,
        model,
        modelType,
    }: {
            mutations: Mutations,
            model: Model,
            modelType: GraphQLObjectType,
        }) {
        const {
            models,
            modelTypes,
            associationsToModel,
            associationsFromModel,
            cache,
        } = this;

        const createMutationName = mutationName(model, 'create');
        mutations[createMutationName] = mutationWithClientMutationId({
            name: createMutationName,
            description: `Create ${getTableName(model)} record.`,
            inputFields: () => {
                const exclude = model.excludeFields ? model.excludeFields : [];
                const fields = attributeFields(model, {
                    exclude,
                    commentToDescription: true,
                    cache
                }) as GraphQLInputFieldConfigMap;

                convertFieldsToGlobalId(model, fields);

                // FIXME: Handle timestamps
                // console.log('_timestampAttributes', Model._timestampAttributes);
                delete fields.createdAt;
                delete fields.updatedAt;

                return fields;
            },
            outputFields: () => {
                const output: GraphQLFieldConfigMap<any, any> = {};
                // New Record
                output[camelcase(`new_${getTableName(model)}`)] = {
                    type: modelType,
                    description: `The new ${getTableName(model)}, if successfully created.`,
                    // tslint:disable-next-line:max-func-args
                    resolve: (args: any, arg2: any, context: any, info: any) => {
                        return resolver(model, {
                        })({}, {
                            [model.primaryKeyAttribute]: args[model.primaryKeyAttribute]
                        }, context, info);
                    }
                };

                // New Edges
                _.each(associationsToModel[getTableName(model)], (association) => {
                    const {
                        from,
                        type: atype,
                        key: field
                    } = association;
                    // console.log("Edge To", getTableName(Model), "From", from, field, atype);
                    if (atype !== "BelongsTo") {
                        // HasMany Association
                        const { connection } = associationsFromModel[from][`${getTableName(model)}_${field}`];
                        const fromType = modelTypes[from] as GraphQLObjectType;
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
                _.each(associationsFromModel[getTableName(model)], (association) => {
                    const {
                        to,
                        type: atype,
                        foreignKey,
                        key: field
                    } = association;
                    // console.log("Edge From", getTableName(Model), "To", to, field, as, atype, foreignKey);
                    if (atype === "BelongsTo") {
                        // BelongsTo association
                        const toType = modelTypes[to] as GraphQLObjectType;
                        output[field] = {
                            type: toType,
                            // tslint:disable-next-line:max-func-args
                            resolve: (args: any, arg2: any, context: any, info: any) => {
                                // console.log('Models', Models, Models[toType.name]);
                                return resolver(models[toType.name], {})({}, { id: args[foreignKey] }, context, info);
                            }
                        };
                    }
                });
                // console.log(`${getTableName(Model)} mutation output`, output);
                return output;
            },
            mutateAndGetPayload: (data) => {
                convertFieldsFromGlobalId(model, data);
                return model.create(data);
            }
        });

    }

    public findRecord({
        queries,
        model,
        modelType
    }: {
            queries: Queries;
            model: Model;
            modelType: GraphQLObjectType;
        }) {
        const findByIdQueryName = queryName(model, 'findById');
        queries[findByIdQueryName] = {
            type: modelType,
            args: defaultArgs(model),
            resolve: resolver(model, {
            })
        };
    }

    public findAll({
        queries,
        model,
        modelType
    }: {
            model: Model;
            modelType: GraphQLObjectType;
            queries: Queries;
        }) {
        const findAllQueryName = queryName(model, 'findAll');
        queries[findAllQueryName] = {
            type: createNonNullList(modelType),
            args: defaultListArgs(model),
            resolve: createNonNullListResolver(resolver(model)),
        };
    }

    public updateRecords({
        mutations,
        model,
        modelType,
    }: {
            mutations: Mutations,
            model: Model,
            modelType: GraphQLObjectType,
        }) {
        const {
            models,
            modelTypes,
            associationsToModel,
            associationsFromModel,
            cache,
        } = this;

        const updateMutationName = mutationName(model, 'update');
        mutations[updateMutationName] = mutationWithClientMutationId({
            name: updateMutationName,
            description: `Update multiple ${getTableName(model)} records.`,
            inputFields: () => {
                const fields = attributeFields(model, {
                    exclude: model.excludeFields ? model.excludeFields : [],
                    commentToDescription: true,
                    allowNull: true,
                    cache
                }) as GraphQLInputFieldConfigMap;

                convertFieldsToGlobalId(model, fields);

                const updateModelTypeName = `Update${getTableName(model)}ValuesInput`;
                const updateModelValuesType: GraphQLInputObjectType = (
                    (cache[updateModelTypeName] as GraphQLInputObjectType)
                    || new GraphQLInputObjectType({
                        name: updateModelTypeName,
                        description: "Values to update",
                        fields
                    }));
                cache[updateModelTypeName] = updateModelValuesType;

                const updateModelWhereType: GraphQLInputObjectType = new GraphQLInputObjectType({
                    name: `Update${getTableName(model)}WhereInput`,
                    description: "Options to describe the scope of the search.",
                    fields
                });

                return {
                    values: {
                        type: updateModelValuesType
                    },
                    where: {
                        type: updateModelWhereType,
                    }
                };

            },
            outputFields: () => {
                const output: GraphQLFieldConfigMap<any, any> = {};
                // New Record
                output[camelcase(`new_${getTableName(model)}`)] = {
                    type: modelType,
                    description: `The new ${getTableName(model)}, if successfully created.`,
                    // tslint:disable-next-line max-func-args
                    resolve: (args: any, arg2: any, context: any, info: any) => {
                        return resolver(model, {
                        })({}, {
                            [model.primaryKeyAttribute]: args[model.primaryKeyAttribute]
                        }, context, info);
                    }
                };

                // New Edges
                _.each(associationsToModel[getTableName(model)], (association) => {
                    const {
                        from,
                        type: atype,
                        key: field
                    } = association;
                    // console.log("Edge To", getTableName(Model), "From", from, field, atype);
                    if (atype !== "BelongsTo") {
                        // HasMany Association
                        const { connection } = associationsFromModel[from][`${getTableName(model)}_${field}`];
                        const fromType = modelTypes[from] as GraphQLObjectType;
                        // console.log("Connection", getTableName(Model), field, nodeType, conn, association);
                        output[camelcase(`new_${fromType.name}_${field}_Edge`)] = {
                            type: connection.edgeType,
                            resolve: (payload) => connection.resolveEdge(payload)
                        };
                    }
                });
                _.each(associationsFromModel[getTableName(model)], (association) => {
                    const {
                        to,
                        type: atype,
                        foreignKey,
                        key: field
                    } = association;
                    // console.log("Edge From", getTableName(Model), "To", to, field, as, atype, foreignKey);
                    if (atype === "BelongsTo") {
                        // BelongsTo association
                        const toType = modelTypes[to] as GraphQLObjectType;
                        output[field] = {
                            type: toType,
                            // tslint:disable-next-line max-func-args
                            resolve: (args: any, arg2: any, context: any, info: any) => {
                                // console.log('Models', models, models[toType.name]);
                                return resolver(models[toType.name], {})({}, { id: args[foreignKey] }, context, info);
                            }
                        };
                    }
                });
                // console.log(`${getTableName(Model)} mutation output`, output);
                const updateModelOutputTypeName = `Update${getTableName(model)}Output`;
                const outputType: GraphQLObjectType = (
                    cache[updateModelOutputTypeName] as GraphQLObjectType
                    || new GraphQLObjectType({
                        name: updateModelOutputTypeName,
                        fields: output
                    }));
                cache[updateModelOutputTypeName] = outputType;

                return {
                    nodes: {
                        type: createNonNullList(outputType),
                        // tslint:disable-next-line max-func-args
                        resolve: createNonNullListResolver((source: any, args: any, context: any, info: any) => {
                            // console.log('update', source, args);
                            return model.findAll({
                                where: source.where
                            });
                        })
                    },
                    affectedCount: {
                        type: GraphQLInt
                    }
                };
            },
            mutateAndGetPayload: (data) => {
                // console.log('mutate', data);
                const { values, where } = data;
                convertFieldsFromGlobalId(model, values);
                convertFieldsFromGlobalId(model, where);
                return model.update(values, {
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

    public updateRecord({
        mutations,
        model,
        modelType,
    }: {
            mutations: Mutations,
            model: Model,
            modelType: GraphQLObjectType,
        }) {
        const {
            models,
            modelTypes,
            associationsToModel,
            associationsFromModel,
            cache,
        } = this;

        const updateMutationName = mutationName(model, 'updateOne');
        mutations[updateMutationName] = mutationWithClientMutationId({
            name: updateMutationName,
            description: `Update a single ${getTableName(model)} record.`,
            inputFields: () => {
                const fields = attributeFields(model, {
                    exclude: model.excludeFields ? model.excludeFields : [],
                    commentToDescription: true,
                    allowNull: true,
                    cache
                }) as GraphQLInputFieldConfigMap;

                convertFieldsToGlobalId(model, fields);

                const updateModelInputTypeName = `Update${getTableName(model)}ValuesInput`;
                const updateModelValuesType = cache[updateModelInputTypeName] || new GraphQLInputObjectType({
                    name: updateModelInputTypeName,
                    description: "Values to update",
                    fields
                });
                cache[updateModelInputTypeName] = updateModelValuesType;

                return {
                    [model.primaryKeyAttribute]: globalIdInputField(getTableName(model)),
                    values: {
                        type: updateModelValuesType
                    }
                } as any;

            },
            outputFields: () => {
                const output: GraphQLFieldConfigMap<any, any> = {};
                // New Record
                output[camelcase(`new_${getTableName(model)}`)] = {
                    type: modelType,
                    description: `The new ${getTableName(model)}, if successfully created.`,
                    // tslint:disable-next-line max-func-args
                    resolve: (args: any, arg2: any, context: any, info: any) => {
                        return resolver(model, {
                        })({}, {
                            [model.primaryKeyAttribute]: args[model.primaryKeyAttribute]
                        }, context, info);
                    }
                };

                // New Edges
                _.each(associationsToModel[getTableName(model)], (association) => {
                    const {
                        from,
                        type: atype,
                        key: field
                    } = association;
                    // console.log("Edge To", getTableName(Model), "From", from, field, atype);
                    if (atype !== "BelongsTo") {
                        // HasMany Association
                        const { connection } = associationsFromModel[from][`${getTableName(model)}_${field}`];
                        const fromType = modelTypes[from] as GraphQLObjectType;
                        // console.log("Connection", getTableName(Model), field, nodeType, conn, association);
                        output[camelcase(`new_${fromType.name}_${field}_Edge`)] = {
                            type: connection.edgeType,
                            resolve: (payload) => connection.resolveEdge(payload)
                        };
                    }
                });
                _.each(associationsFromModel[getTableName(model)], (association) => {
                    const {
                        to,
                        type: atype,
                        foreignKey,
                        key: field
                    } = association;
                    // console.log("Edge From", getTableName(Model), "To", to, field, as, atype, foreignKey);
                    if (atype === "BelongsTo") {
                        // BelongsTo association
                        const toType = modelTypes[to] as GraphQLObjectType;
                        output[field] = {
                            type: toType,
                            // tslint:disable-next-line:max-func-args
                            resolve: (args: any, arg2: any, context: any, info: any) => {
                                // console.log('Models', Models, Models[toType.name]);
                                return resolver(models[toType.name], {})({}, { id: args[foreignKey] }, context, info);
                            }
                        };
                    }
                });
                // console.log(`${getTableName(Model)} mutation output`, output);

                const updateModelOutputTypeName = `Update${getTableName(model)}Output`;
                const outputType = cache[updateModelOutputTypeName] || new GraphQLObjectType({
                    name: updateModelOutputTypeName,
                    fields: output
                });
                cache[updateModelOutputTypeName] = outputType;

                return output;

            },
            mutateAndGetPayload: (data) => {
                // console.log('mutate', data);
                const { values } = data;
                const where = {
                    [model.primaryKeyAttribute]: data[model.primaryKeyAttribute]
                };
                convertFieldsFromGlobalId(model, values);
                convertFieldsFromGlobalId(model, where);

                return model.update(values, {
                    where
                })
                    .then((result) => {
                        return where;
                    });

            }
        });

    }

    public deleteRecords({
        mutations,
        model,
        modelType,
    }: {
            mutations: Mutations,
            model: Model,
            modelType: GraphQLObjectType,
        }) {
        const {
            cache,
        } = this;

        const deleteMutationName = mutationName(model, 'delete');
        mutations[deleteMutationName] = mutationWithClientMutationId({
            name: deleteMutationName,
            description: `Delete ${getTableName(model)} records.`,
            inputFields: () => {
                const fields = attributeFields(model, {
                    exclude: model.excludeFields ? model.excludeFields : [],
                    commentToDescription: true,
                    allowNull: true,
                    cache
                }) as GraphQLInputFieldConfigMap;
                convertFieldsToGlobalId(model, fields);
                const deleteModelWhereType = new GraphQLInputObjectType({
                    name: `Delete${getTableName(model)}WhereInput`,
                    description: "Options to describe the scope of the search.",
                    fields
                });
                return {
                    where: {
                        type: deleteModelWhereType,
                    }
                };
            },
            outputFields: () => {
                return {
                    affectedCount: {
                        type: GraphQLInt
                    }
                };
            },
            mutateAndGetPayload: (data) => {
                const { where } = data;
                convertFieldsFromGlobalId(model, where);
                return model.destroy({
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

    public deleteRecord({
        mutations,
        model,
        modelType,
    }: {
            mutations: Mutations,
            model: Model,
            modelType: GraphQLObjectType,
        }) {
        const deleteMutationName = mutationName(model, 'deleteOne');
        mutations[deleteMutationName] = mutationWithClientMutationId({
            name: deleteMutationName,
            description: `Delete single ${getTableName(model)} record.`,
            inputFields: () => {
                return {
                    [model.primaryKeyAttribute]: globalIdInputField(getTableName(model)),
                } as any;
            },
            outputFields: () => {
                const idField = camelcase(`deleted_${getTableName(model)}_id`);
                return {
                    [idField]: {
                        type: GraphQLID,
                        resolve: (source) => {
                            return source[model.primaryKeyAttribute];
                        }
                    }
                };
            },
            mutateAndGetPayload: (data) => {
                const where = {
                    [model.primaryKeyAttribute]: data[model.primaryKeyAttribute]
                };
                convertFieldsFromGlobalId(model, where);
                return model.destroy({
                    where
                })
                    .then((affectedCount) => {
                        return data;
                    });
            }
        });

    }

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

export interface Queries extends GraphQLFieldConfigMap<any, any> {
    [queryName: string]: GraphQLFieldConfig<any, any>;
}

export interface Mutations extends GraphQLFieldConfigMap<any, any> {
    [mutationName: string]: GraphQLFieldConfig<any, any>;
}

export interface OperationFactoryConfig {
    models: Models;
    modelTypes: ModelTypes;
    associationsToModel: AssociationToModels;
    associationsFromModel: AssociationFromModels;
    cache: Cache;
}
