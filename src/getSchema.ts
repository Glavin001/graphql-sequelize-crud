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

import * as jsonType from "graphql-sequelize/lib/types/jsonType";

import {
    OperationFactory,
    ModelTypes,
    AssociationToModels,
    AssociationFromModels,
    Queries,
    Model,
} from "./OperationFactory";
import {
    getTableName,
    connectionNameForAssociation,
} from "./utils";

export function getSchema(sequelize: Sequelize) {

    const { nodeInterface, nodeField, nodeTypeMapper } = sequelizeNodeInterface(sequelize);

    const models = sequelize.models;
    const queries: Queries = {};
    const mutations: any = {};
    const associationsToModel: AssociationToModels = {};
    const associationsFromModel: AssociationFromModels = {};
    const cache: any = {};

    // Create types map
    const modelTypes: ModelTypes = Object.keys(models).reduce((types: ModelTypes, key: string) => {
        const model: Model = models[key];
        const modelType = new GraphQLObjectType({
            name: getTableName(model),
            fields: () => {
                // Lazily load fields
                return Object.keys(model.associations)
                    .reduce((fields: GraphQLFieldConfigMap<any, any>, akey: string) => {
                        const association = model.associations[akey];
                        const atype = association.associationType;
                        const target = association.target;
                        const targetType = modelTypes[target.name];
                        if (atype === "BelongsTo") {
                            fields[akey] = {
                                type: targetType as GraphQLObjectType,
                                resolve: resolver(association, {
                                    separate: true
                                })
                            };
                        } else {
                            const connectionName = connectionNameForAssociation(model, akey);
                            const connection = modelTypes[connectionName] as any;
                            fields[akey] = {
                                type: connection.connectionType,
                                args: connection.connectionArgs,
                                resolve: connection.resolve
                            };
                        }
                        return fields;
                    },
                    // Attribute fields
                    attributeFields(model, {
                        exclude: model.excludeFields ? model.excludeFields : [],
                        globalId: true,
                        commentToDescription: true,
                        cache
                    })
                    );
            },
            interfaces: [nodeInterface]
        });
        types[getTableName(model)] = modelType;

        // === CRUD ====
        const operationFactory = new OperationFactory({
            cache,
            models,
            modelTypes: types,
            associationsFromModel,
            associationsToModel,
        });
        // CREATE single
        operationFactory.createRecord({
            mutations,
            model,
            modelType,
        });

        // READ single
        operationFactory.findRecord({
            queries,
            model,
            modelType,
        });

        // READ all
        operationFactory.findAll({
            queries,
            model,
            modelType,
        });

        // UPDATE single
        operationFactory.updateRecord({
            mutations,
            model,
            modelType,
        });

        // UPDATE multiple
        operationFactory.updateRecords({
            mutations,
            model,
            modelType,
        });

        // DELETE single
        operationFactory.deleteRecord({
            mutations,
            model,
            modelType,
        });

        operationFactory.deleteRecords({
            mutations,
            model,
            modelType,
        });

        return types;
    }, {});

    // Create Connections
    _.each(models, (model: Model) => {
        _.each(model.associations, (association: Association, akey: string) => {

            const atype = association.associationType;
            const target = association.target;
            const foreignKey = association.foreignKey;
            const as = association.as;
            const targetType = modelTypes[target.name] as GraphQLObjectType;
            const connectionName = connectionNameForAssociation(model, akey);
            if (atype === "BelongsTo") {
                // BelongsTo
                _.set(associationsToModel, `${targetType.name}.${akey}`, {
                    from: getTableName(model),
                    type: atype,
                    key: akey,
                    foreignKey,
                    as
                });
                _.set(associationsFromModel, `${getTableName(model)}.${akey}`, {
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
                    const aModel = association.through.model;
                    // console.log('BelongsToMany model', aModel);
                    edgeFields = attributeFields(aModel, {
                        exclude: aModel.excludeFields ? aModel.excludeFields : [],
                        globalId: true,
                        commentToDescription: true,
                        cache
                    });
                    // Pass Through model to resolve function
                    _.each(edgeFields, (edgeField: any, field: string) => {
                        const oldResolve: GraphQLFieldResolver<any, any> = edgeField.resolve;
                        // console.log(field, edgeField, Object.keys(edgeField));
                        if (typeof oldResolve !== 'function') {
                            // console.log(oldResolve);
                            // tslint:disable-next-line:max-func-args
                            const resolve: GraphQLFieldResolver<any, any> = (source, args, context, info) => {
                                const modelNode = source.node[getTableName(aModel)];
                                return modelNode[field];
                            };
                            edgeField.resolve = resolve.bind(edgeField);
                        } else {
                            // tslint:disable-next-line:max-func-args
                            const resolve: GraphQLFieldResolver<any, any> = (source, args, context, info) => {
                                const modelNode = source.node[getTableName(aModel)];
                                return oldResolve(modelNode, args, context, info);
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
                            description:
                                `Total count of ${targetType.name} results associated with ${getTableName(model)}.`,
                            resolve: ({ source }: any) => {
                                const { accessors } = association;
                                return source[accessors.count]();
                            }
                        }
                    },
                    edgeFields
                });
                modelTypes[connectionName] = connection;
                _.set(associationsToModel, `${targetType.name}.${getTableName(model)}_${akey}`, {
                    from: getTableName(model),
                    type: atype,
                    key: akey,
                    connection,
                    as
                });
                _.set(associationsFromModel, `${getTableName(model)}.${targetType.name}_${akey}`, {
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
    _.each(Object.keys(models), (key) => {
        const model: any = models[key];

        // Custom Queries
        if (model.queries) {
            _.assign(queries, model.queries(models, modelTypes, resolver));
        }
        // Custom Mutations
        if (model.mutations) {
            _.assign(mutations, model.mutations(models, modelTypes, resolver));
        }

    });

    // Configure NodeTypeMapper
    nodeTypeMapper.mapTypes({
        ...modelTypes
    });

    const queryRoot: GraphQLObjectType = new GraphQLObjectType({
        name: "Root",
        description: "Root of the Schema",
        fields: () => ({
            root: {
                // Cite: https://github.com/facebook/relay/issues/112#issuecomment-170648934
                type: new GraphQLNonNull(queryRoot),
                description: "Self-Pointer from Root to Root",
                resolve: () => ({})
            },
            ...queries,
            node: nodeField
        })
    });

    const mutationRoot = new GraphQLObjectType({
        name: "Mutations",
        fields: {
            ...mutations
        }
    });

    return new GraphQLSchema({
        query: queryRoot,
        mutation: mutationRoot
    });

}

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
