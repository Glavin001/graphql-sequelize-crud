declare module "graphql-sequelize" {

    import { GraphQLFieldResolver } from "graphql";
    import { ConnectionConfig } from "graphql-relay";

    export function defaultArgs(Model: any): any;

    export function defaultListArgs(Model: any): { limit: any; order: any; where: any; };

    export interface AttributeFieldsOptions {
        exclude?: Array<any>, // array of model attributes to ignore - default: []
        only?: Array<any>, // only generate definitions for these model attributes - default: null
        globalId?: boolean, // return an relay global id field - default: false
        map?: object, // rename fields - default: {}
        allowNull?: boolean, // disable wrapping mandatory fields in `GraphQLNonNull` - default: false
        commentToDescription?: boolean, // convert model comment to GraphQL description - default: false
        cache?: object, // Cache enum types to prevent duplicate type name error - default: {}
    }

    export function attributeFields(Model: any, options?: AttributeFieldsOptions): any;

    export function resolver(Model: any, options?: {
        before?: Function;
        after?: Function;
        separate?: boolean;
    }): any;

    function sequelizeNodeInterface(sequelize: any): {
        nodeInterface: any;
        nodeField: any;
        nodeTypeMapper: any;
    };

    function sequelizeConnection(): any;

    // export declare const relay = {
    //   sequelizeNodeInterface: sequelizeNodeInterface,
    //   sequelizeConnection: sequelizeConnection
    // };

    // export {
    //     sequelizeNodeInterface,
    //     sequelizeConnection
    //   } as relay;

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
        sequelizeNodeInterface(sequelize: any): {
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
