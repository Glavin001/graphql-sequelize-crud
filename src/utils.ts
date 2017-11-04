import * as _ from 'lodash';
import * as camelcase from 'camelcase';
import * as pluralize from 'pluralize';
import {
    GraphQLID,
    GraphQLNonNull,
    GraphQLFieldConfigMap,
    GraphQLInputFieldConfigMap,
    GraphQLInputField,
    GraphQLList,
    GraphQLType,
    GraphQLInputType,
    GraphQLFieldResolver,
} from 'graphql';
import {
    fromGlobalId,
} from "graphql-relay";
import {
    Model,
} from "./types";

// tslint:disable-next-line:no-reserved-keywords
export function mutationName(model: Model, type: string) {
    switch (type) {
        case 'create': {
            return camelcase(`${type}_${getTableName(model)}`);
        }
        case 'update': {
            return camelcase(`${type}_${pluralize.plural(getTableName(model))}`);
        }
        case 'updateOne': {
            return camelcase(`update_${getTableName(model)}`);
        }
        case 'delete': {
            return camelcase(`${type}_${pluralize.plural(getTableName(model))}`);
        }
        case 'deleteOne': {
            return camelcase(`delete_${getTableName(model)}`);
        }
        default: {
            console.warn('Unknown mutation type: ', type);
            return camelcase(`${type}_${getTableName(model)}`);
        }
    }
}

export function convertFieldsFromGlobalId(model: Model, data: { [key: string]: any; }) {
    // Fix Relay Global ID
    const rawAttributes = attributesForModel(model);
    _.each(Object.keys(data), (key) => {
        if (key === "clientMutationId") {
            return;
        }
        // Check if reference attribute
        const attr = rawAttributes[key];
        if (!attr) {
            return;
        }
        if (attr.references || attr.primaryKey) {
            const { id } = fromGlobalId(data[key]);

            // Check if id is numeric.
            if (!_.isNaN(_.toNumber(id))) {
                data[key] = parseInt(id);
            } else {
                data[key] = id;
            }
        }
    });
}

export function convertFieldsToGlobalId(
    model: Model,
    fields: GraphQLFieldConfigMap<any, any> | GraphQLInputFieldConfigMap,
) {
    // Fix Relay Global ID
    const rawAttributes = attributesForModel(model);
    _.each(Object.keys(rawAttributes), (key) => {
        if (key === "clientMutationId") {
            return;
        }
        // Check if reference attribute
        const attr = rawAttributes[key];
        if (!attr) {
            return;
        }
        if (attr.references) {
            // console.log(`Replacing ${getTableName(Model)}'s field ${k} with globalIdField.`);
            const modelName = attr.references.model;
            fields[key] = globalIdInputField(modelName);
        } else if (attr.primaryKey) {
            fields[key] = globalIdInputField(getTableName(model));
            // Make primaryKey optional (allowNull=True)
            fields[key].type = GraphQLID;
        }
    });
}

export function connectionNameForAssociation(model: Model, associationName: string) {
    return camelcase(`${getTableName(model)}_${associationName}`);
}

export function attributesForModel(model: Model): RawAttributes {
    return (<any>model).rawAttributes;
}

export interface RawAttributes {
    [key: string]: RawAttribute | undefined;
}

export interface RawAttribute {
    primaryKey: string;
    references: {
        model: string;
    };
}

// tslint:disable-next-line:no-reserved-keywords
export function queryName(model: Model, type: string) {
    switch (type) {
        case 'findAll': {
            return camelcase(pluralize.plural(getTableName(model)));
        }
        case 'findById': {
            return camelcase(getTableName(model));
        }
        default: {
            console.warn('Unknown query type: ', type);
            return camelcase(`${type}_${getTableName(model)}`);
        }
    }
}

export function getTableName(model: Model): string {
    return (<any>model).name;
}

export function globalIdInputField(modelName: string): GraphQLInputField {
    return {
        name: 'id',
        description: `The ID for ${modelName}`,
        type: new GraphQLNonNull(GraphQLID),
    };
}

export function createNonNullList<T extends GraphQLInputType | GraphQLType>(modelType: T): T {
    return new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(modelType))) as any;
}

export function createNonNullListResolver(resolver: GraphQLFieldResolver<any, any>): GraphQLFieldResolver<any, any> {
    // tslint:disable-next-line:max-func-args
    return (source: any, args: any, context: any, info: any) => {
        return Promise.resolve(resolver(source, args, context, info))
            .then((results: null | object | object[]) => {
                if (results === null || results === undefined) {
                    return [];
                } else if (Array.isArray(results)) {
                    return results;
                }
                return [results];
            });
    };
}
