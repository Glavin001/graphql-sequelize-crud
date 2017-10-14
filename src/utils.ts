import * as _ from 'lodash';
import * as camelcase from 'camelcase';
import * as pluralize from 'pluralize';
import {
    GraphQLID,
    GraphQLFieldConfigMap,
    GraphQLInputFieldConfigMap,
} from 'graphql';
import {
    fromGlobalId,
    globalIdField,
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
            fields[key] = globalIdField(modelName);
        } else if (attr.primaryKey) {
            fields[key] = globalIdField(getTableName(model));
            // Make primaryKey optional (allowNull=True)
            fields[key].type = GraphQLID;
        }
    });
}

export function connectionNameForAssociation(model: Model, associationName: string) {
    return camelcase(`${getTableName(model)}_${associationName}`);
}

export function attributesForModel(model: Model): RawAttributes {
    return (<any> model).rawAttributes;
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
