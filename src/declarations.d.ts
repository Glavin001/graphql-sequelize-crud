// tslint:disable no-duplicate-imports
declare module "graphql-sequelize-crud" {
    import { GraphQLObjectType } from "graphql";
    import { Model as SequelizeModel } from "sequelize";
    import { SequelizeConnection} from "graphql-sequelize";

    export interface Model extends SequelizeModel<any, any> {
        associations: {
            [associationKey: string]: Association;
        };
        excludeFields?: string[];
        primaryKeyAttribute: string;
        queries?(models: ModelsHashInterface, modelTypes: ModelTypes, resolver: any): any;
        mutations?(models: ModelsHashInterface, modelTypes: ModelTypes, resolver: any): any;
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

    export interface ModelsHashInterface {
        [name: string]: Model;
    }

    export interface ModelTypes {
        [tableName: string]: GraphQLObjectType | SequelizeConnection;
    }

}

declare module "graphql-sequelize" {

    import {
        GraphQLFieldResolver,
        GraphQLFieldConfigArgumentMap,
        GraphQLFieldConfig,
        GraphQLFieldConfigMap,
        GraphQLInputFieldConfigMap,
    } from "graphql";
    import { ConnectionConfig } from "graphql-relay";
    import { Sequelize } from "sequelize";
    import { Model, Association } from "graphql-sequelize-crud";

    export function defaultArgs(model: Model): GraphQLFieldConfigArgumentMap;

    export function defaultListArgs(model: Model):
        GraphQLFieldConfigArgumentMap & { limit: any; order: any; where: any; };

    export interface AttributeFieldsOptions {
        exclude?: any[]; // array of model attributes to ignore - default: []
        only?: any[]; // only generate definitions for these model attributes - default: null
        globalId?: boolean; // return an relay global id field - default: false
        map?: object; // rename fields - default: {}
        allowNull?: boolean; // disable wrapping mandatory fields in `GraphQLNonNull` - default: false
        commentToDescription?: boolean; // convert model comment to GraphQL description - default: false
        cache?: object; // Cache enum types to prevent duplicate type name error - default: {}
    }

    export function attributeFields(model: Model, options?: AttributeFieldsOptions): AttributeFields;

    export type AttributeFields = GraphQLFieldConfigMap<any, any> | GraphQLInputFieldConfigMap;

    export function resolver(model: Model | Association, options?: {
        before?: Function;
        after?: Function;
        separate?: boolean;
    }): any;

    function sequelizeNodeInterface(sequelize: Sequelize): {
        nodeInterface: any;
        nodeField: any;
        nodeTypeMapper: any;
    };

    function sequelizeConnection(): any;

    export interface SequelizeConnection {
        connectionType: any;
        edgeType: any;
        nodeType: any;
        resolveEdge: any;
        connectionArgs: any;
        resolve: GraphQLFieldResolver<any, any>;
    }

    interface SequelizeConnectionOptions extends ConnectionConfig {
        name: string;
        nodeType: any;
        target: any;
        connectionFields: any;
        edgeFields: any;
    }

    interface Relay {
        sequelizeNodeInterface(sequelize: Sequelize): {
            nodeInterface: any;
            nodeField: any;
            nodeTypeMapper: any;
        };
        sequelizeConnection(options: SequelizeConnectionOptions): SequelizeConnection;
    }

    export const relay: Relay;

}

declare module "graphql-sequelize/lib/types/jsonType" {

}

// declare namespace sequelize {
//     export interface Hooks<TInstance> {

//     }
//     export interface Associations {

//     }
//     export interface Model<TInstance, TAttributes> extends Hooks<TInstance>, Associations {
//         name: string;
//     }
// }
