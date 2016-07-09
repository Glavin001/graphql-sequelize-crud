"use strict";

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var _require = require('graphql');

var GraphQLObjectType = _require.GraphQLObjectType;
var GraphQLSchema = _require.GraphQLSchema;
var GraphQLInt = _require.GraphQLInt;
var GraphQLString = _require.GraphQLString;
var GraphQLList = _require.GraphQLList;
var GraphQLNonNull = _require.GraphQLNonNull;

var _ = require('lodash');
var pluralize = require('pluralize');
var camelcase = require('camelcase');

var _require2 = require("graphql-relay");

var fromGlobalId = _require2.fromGlobalId;
var globalIdField = _require2.globalIdField;
var mutationWithClientMutationId = _require2.mutationWithClientMutationId;

var _require3 = require("graphql-sequelize");

var attributeFields = _require3.attributeFields;
var resolver = _require3.resolver;
var _require3$relay = _require3.relay;
var sequelizeNodeInterface = _require3$relay.sequelizeNodeInterface;
var sequelizeConnection = _require3$relay.sequelizeConnection;


function connectionNameForAssociation(Model, associationName) {
  return camelcase(Model.name + '_' + associationName);
}
function queryName(Model, type) {
  switch (type) {
    case 'findAll':
      {
        return camelcase(pluralize.plural(Model.name));
      }
    case 'findById':
      {
        return camelcase(Model.name);
      }
    default:
      {
        console.warn('Unknown query type: ', type);
        return camelcase(type + '_' + Model.name);
      }
  }
}
function mutationName(Model, type) {
  return camelcase(type + '_' + Model.name);
}

function _createRecord(_ref) {
  var mutations = _ref.mutations;
  var Model = _ref.Model;
  var modelType = _ref.modelType;
  var ModelTypes = _ref.ModelTypes;
  var associationsToModel = _ref.associationsToModel;
  var associationsFromModel = _ref.associationsFromModel;


  var createMutationName = mutationName(Model, 'create');
  mutations[createMutationName] = mutationWithClientMutationId({
    name: createMutationName,
    description: 'Create ' + Model.name + ' record.',
    inputFields: function inputFields() {
      var fields = attributeFields(Model, {
        commentToDescription: true
      });
      // Fix Relay Global ID
      _.each(Object.keys(Model.rawAttributes), function (k) {
        // Check if reference attribute
        var attr = Model.rawAttributes[k];
        if (attr.references) {
          // console.log(`Replacing ${Model.name}'s field ${k} with globalIdField.`);
          var modelName = attr.references.model;
          // let modelType = types[modelName];
          fields[k] = globalIdField(modelName);
        }
      });
      delete fields.id;
      delete fields.created_at;
      delete fields.updated_at;
      return fields;
    },
    outputFields: function outputFields() {
      var output = {};
      // New Record
      output[camelcase('new_' + Model.name)] = {
        type: modelType,
        description: 'The new ' + Model.name + ', if successfully created.',
        resolve: function resolve(args, e, context, info) {
          return resolver(Model, {
            include: false
          })({}, { id: args.id }, context, info);
        }
      };

      // New Edges
      _.each(associationsToModel[Model.name], function (a) {
        var from = a.from;
        var atype = a.type;
        var field = a.key;
        // console.log("Edge To", Model.name, "From", from, field, atype);

        if (atype !== "BelongsTo") {
          (function () {
            // HasMany Association
            var connection = associationsFromModel[from][Model.name + '_' + field].connection;

            var fromType = ModelTypes[from];
            // let nodeType = conn.nodeType;
            // let association = Model.associations[field];
            // let targetType = association
            // console.log("Connection", Model.name, field, nodeType, conn, association);
            output[camelcase('new_' + fromType.name + '_' + field + '_Edge')] = {
              type: connection.edgeType,
              resolve: function resolve(payload) {
                return connection.resolveEdge(payload);
              }
            };
          })();
        }
      });
      _.each(associationsFromModel[Model.name], function (a) {
        var to = a.to;
        var atype = a.type;
        var foreignKey = a.foreignKey;
        var field = a.key;
        // console.log("Edge From", Model.name, "To", to, field, as, atype, foreignKey);

        if (atype === "BelongsTo") {
          (function () {
            // BelongsTo association
            var toType = ModelTypes[to];
            output[field] = {
              type: toType,
              resolve: function resolve(args, e, context, info) {
                return resolver(Models[toType.name], {
                  include: false
                })({}, { id: args[foreignKey] }, context, info);
              }
            };
          })();
        }
      });

      // console.log(`${Model.name} mutation output`, output);

      return output;
    },
    mutateAndGetPayload: function mutateAndGetPayload(data) {

      // Fix Relay Global ID
      _.each(Object.keys(data), function (k) {
        if (k === "clientMutationId") {
          return;
        }
        // Check if reference attribute
        var attr = Model.rawAttributes[k];
        if (attr.references) {
          var _fromGlobalId = fromGlobalId(data[k]);

          var id = _fromGlobalId.id;

          data[k] = parseInt(id);
        }
      });

      return Model.create(data);
    }
  });
}

function _findRecord(_ref2) {
  var queries = _ref2.queries;
  var Model = _ref2.Model;
  var modelType = _ref2.modelType;

  var findByIdQueryName = queryName(Model, 'findById'); //`find${Model.name}ById`;
  queries[findByIdQueryName] = {
    type: modelType,
    args: {
      id: {
        type: new GraphQLNonNull(GraphQLInt)
      }
    },
    resolve: resolver(Model, {
      include: false // disable auto including of associations based on AST - default: true
    })
  };
}

function _findAll(_ref3) {
  var queries = _ref3.queries;
  var Model = _ref3.Model;
  var modelType = _ref3.modelType;

  var findAllQueryName = queryName(Model, 'findAll');
  queries[findAllQueryName] = {
    type: new GraphQLList(modelType),
    args: {
      // An arg with the key limit will automatically be converted to a limit on the target
      limit: {
        type: GraphQLInt
      },
      // An arg with the key order will automatically be converted to a order on the target
      order: {
        type: GraphQLString
      }
    },
    resolve: resolver(Model)
  };
}

function _updateRecord(_ref4) {
  var mutations = _ref4.mutations;
  var Model = _ref4.Model;
  var modelType = _ref4.modelType;
  var ModelTypes = _ref4.ModelTypes;
  var associationsToModel = _ref4.associationsToModel;
  var associationsFromModel = _ref4.associationsFromModel;


  var createMutationName = mutationName(Model, 'update');
  mutations[createMutationName] = mutationWithClientMutationId({
    name: createMutationName,
    description: 'Update ' + Model.name + ' record.',
    inputFields: function inputFields() {
      var fields = attributeFields(Model, {
        commentToDescription: true
      });
      // Fix Relay Global ID
      _.each(Object.keys(Model.rawAttributes), function (k) {
        // Check if reference attribute
        var attr = Model.rawAttributes[k];
        if (attr.references) {
          // console.log(`Replacing ${Model.name}'s field ${k} with globalIdField.`);
          var modelName = attr.references.model;
          // let modelType = types[modelName];
          fields[k] = globalIdField(modelName);
        }
      });
      delete fields.id;
      delete fields.created_at;
      delete fields.updated_at;
      return fields;
    },
    outputFields: function outputFields() {
      var output = {};
      // New Record
      output[camelcase('new_' + Model.name)] = {
        type: modelType,
        description: 'The new ' + Model.name + ', if successfully created.',
        resolve: function resolve(args, e, context, info) {
          return resolver(Model, {
            include: false
          })({}, { id: args.id }, context, info);
        }
      };

      // New Edges
      _.each(associationsToModel[Model.name], function (a) {
        var from = a.from;
        var atype = a.type;
        var field = a.key;
        // console.log("Edge To", Model.name, "From", from, field, atype);

        if (atype !== "BelongsTo") {
          (function () {
            // HasMany Association
            var connection = associationsFromModel[from][Model.name + '_' + field].connection;

            var fromType = ModelTypes[from];
            // let nodeType = conn.nodeType;
            // let association = Model.associations[field];
            // let targetType = association
            // console.log("Connection", Model.name, field, nodeType, conn, association);
            output[camelcase('new_' + fromType.name + '_' + field + '_Edge')] = {
              type: connection.edgeType,
              resolve: function resolve(payload) {
                return connection.resolveEdge(payload);
              }
            };
          })();
        }
      });
      _.each(associationsFromModel[Model.name], function (a) {
        var to = a.to;
        var atype = a.type;
        var foreignKey = a.foreignKey;
        var field = a.key;
        // console.log("Edge From", Model.name, "To", to, field, as, atype, foreignKey);

        if (atype === "BelongsTo") {
          (function () {
            // BelongsTo association
            var toType = ModelTypes[to];
            output[field] = {
              type: toType,
              resolve: function resolve(args, e, context, info) {
                return resolver(Models[toType.name], {
                  include: false
                })({}, { id: args[foreignKey] }, context, info);
              }
            };
          })();
        }
      });

      // console.log(`${Model.name} mutation output`, output);

      return output;
    },
    mutateAndGetPayload: function mutateAndGetPayload(data) {

      // Fix Relay Global ID
      _.each(Object.keys(data), function (k) {
        if (k === "clientMutationId") {
          return;
        }
        // Check if reference attribute
        var attr = Model.rawAttributes[k];
        if (attr.references) {
          var _fromGlobalId2 = fromGlobalId(data[k]);

          var id = _fromGlobalId2.id;

          data[k] = parseInt(id);
        }
      });

      return Model.create(data);
    }
  });
}

function _deleteRecord(_ref5) {
  var mutations = _ref5.mutations;
  var Model = _ref5.Model;
  var modelType = _ref5.modelType;
  var ModelTypes = _ref5.ModelTypes;
  var associationsToModel = _ref5.associationsToModel;
  var associationsFromModel = _ref5.associationsFromModel;


  var createMutationName = mutationName(Model, 'delete');
  mutations[createMutationName] = mutationWithClientMutationId({
    name: createMutationName,
    description: 'Delete ' + Model.name + ' record.',
    inputFields: function inputFields() {
      var fields = attributeFields(Model, {
        commentToDescription: true
      });
      // Fix Relay Global ID
      _.each(Object.keys(Model.rawAttributes), function (k) {
        // Check if reference attribute
        var attr = Model.rawAttributes[k];
        if (attr.references) {
          // console.log(`Replacing ${Model.name}'s field ${k} with globalIdField.`);
          var modelName = attr.references.model;
          // let modelType = types[modelName];
          fields[k] = globalIdField(modelName);
        }
      });
      delete fields.id;
      delete fields.created_at;
      delete fields.updated_at;
      return fields;
    },
    outputFields: function outputFields() {
      var output = {};
      // New Record
      output[camelcase('new_' + Model.name)] = {
        type: modelType,
        description: 'The new ' + Model.name + ', if successfully created.',
        resolve: function resolve(args, e, context, info) {
          return resolver(Model, {
            include: false
          })({}, { id: args.id }, context, info);
        }
      };

      // New Edges
      _.each(associationsToModel[Model.name], function (a) {
        var from = a.from;
        var atype = a.type;
        var field = a.key;
        // console.log("Edge To", Model.name, "From", from, field, atype);

        if (atype !== "BelongsTo") {
          (function () {
            // HasMany Association
            var connection = associationsFromModel[from][Model.name + '_' + field].connection;

            var fromType = ModelTypes[from];
            // let nodeType = conn.nodeType;
            // let association = Model.associations[field];
            // let targetType = association
            // console.log("Connection", Model.name, field, nodeType, conn, association);
            output[camelcase('new_' + fromType.name + '_' + field + '_Edge')] = {
              type: connection.edgeType,
              resolve: function resolve(payload) {
                return connection.resolveEdge(payload);
              }
            };
          })();
        }
      });
      _.each(associationsFromModel[Model.name], function (a) {
        var to = a.to;
        var atype = a.type;
        var foreignKey = a.foreignKey;
        var field = a.key;
        // console.log("Edge From", Model.name, "To", to, field, as, atype, foreignKey);

        if (atype === "BelongsTo") {
          (function () {
            // BelongsTo association
            var toType = ModelTypes[to];
            output[field] = {
              type: toType,
              resolve: function resolve(args, e, context, info) {
                return resolver(Models[toType.name], {
                  include: false
                })({}, { id: args[foreignKey] }, context, info);
              }
            };
          })();
        }
      });

      // console.log(`${Model.name} mutation output`, output);

      return output;
    },
    mutateAndGetPayload: function mutateAndGetPayload(data) {

      // Fix Relay Global ID
      _.each(Object.keys(data), function (k) {
        if (k === "clientMutationId") {
          return;
        }
        // Check if reference attribute
        var attr = Model.rawAttributes[k];
        if (attr.references) {
          var _fromGlobalId3 = fromGlobalId(data[k]);

          var id = _fromGlobalId3.id;

          data[k] = parseInt(id);
        }
      });

      return Model.create(data);
    }
  });
}

function getSchema(sequelize) {
  var _sequelizeNodeInterfa = sequelizeNodeInterface(sequelize);

  var nodeInterface = _sequelizeNodeInterfa.nodeInterface;
  var nodeField = _sequelizeNodeInterfa.nodeField;
  var nodeTypeMapper = _sequelizeNodeInterfa.nodeTypeMapper;


  var Models = sequelize.models;
  var queries = {};
  var mutations = {};
  var associationsToModel = {};
  var associationsFromModel = {};

  // Create types map
  var ModelTypes = Object.keys(Models).reduce(function (types, key) {
    var Model = Models[key];
    var modelType = new GraphQLObjectType({
      name: Model.name,
      fields: function fields() {
        // Lazily load fields
        return Object.keys(Model.associations).reduce(function (fields, akey) {
          var association = Model.associations[akey];
          var atype = association.associationType;
          var target = association.target;
          var targetType = ModelTypes[target.name];
          if (atype === "BelongsTo") {
            fields[akey] = {
              type: targetType,
              resolve: resolver(association, {
                separate: true
              })
            };
          } else {
            var connectionName = connectionNameForAssociation(Model, akey);
            var connection = ModelTypes[connectionName];
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
          commentToDescription: true
        }));
      },
      interfaces: [nodeInterface]
    });
    types[Model.name] = modelType;
    // === CRUD ====
    // CREATE single
    _createRecord({
      mutations: mutations,
      Model: Model,
      modelType: modelType,
      ModelTypes: types,
      associationsToModel: associationsToModel,
      associationsFromModel: associationsFromModel
    });

    // READ single
    _findRecord({
      queries: queries,
      Model: Model,
      modelType: modelType
    });

    // READ all
    _findAll({
      queries: queries,
      Model: Model,
      modelType: modelType
    });

    // UPDATE single
    _updateRecord({
      mutations: mutations,
      Model: Model,
      modelType: modelType,
      ModelTypes: types,
      associationsToModel: associationsToModel,
      associationsFromModel: associationsFromModel
    });

    // DELETE single
    _deleteRecord({
      mutations: mutations,
      Model: Model,
      modelType: modelType,
      ModelTypes: types,
      associationsToModel: associationsToModel,
      associationsFromModel: associationsFromModel
    });

    return types;
  }, {});

  // Create Connections
  _.each(Models, function (Model) {
    _.each(Model.associations, function (association, akey) {

      var atype = association.associationType;
      var target = association.target;
      var foreignKey = association.foreignKey;
      var as = association.as;
      var targetType = ModelTypes[target.name];
      var connectionName = connectionNameForAssociation(Model, akey);
      if (atype === "BelongsTo") {
        // BelongsTo
        _.set(associationsToModel, targetType.name + '.' + akey, {
          from: Model.name,
          type: atype,
          key: akey,
          foreignKey: foreignKey,
          as: as
        });
        _.set(associationsFromModel, Model.name + '.' + akey, {
          to: targetType.name,
          type: atype,
          key: akey,
          foreignKey: foreignKey,
          as: as
        });
      } else {
        // HasMany
        var connection = sequelizeConnection({
          name: connectionName,
          nodeType: targetType,
          target: association,
          as: as
        });
        ModelTypes[connectionName] = connection;
        _.set(associationsToModel, targetType.name + '.' + Model.name + '_' + akey, {
          from: Model.name,
          type: atype,
          key: akey,
          connection: connection,
          as: as
        });
        _.set(associationsFromModel, Model.name + '.' + targetType.name + '_' + akey, {
          to: targetType.name,
          type: atype,
          key: akey,
          connection: connection,
          as: as
        });
      }
    });
  });
  // console.log("associationsToModel", associationsToModel);
  // console.log("associationsFromModel", associationsFromModel);

  // Custom Queries and Mutations
  _.each(Object.keys(Models), function (key) {
    var Model = Models[key];

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
  nodeTypeMapper.mapTypes(_extends({}, ModelTypes));

  var Queries = new GraphQLObjectType({
    name: "Root",
    description: "Root of the Schema",
    fields: function fields() {
      return _extends({
        root: {
          // Cite: https://github.com/facebook/relay/issues/112#issuecomment-170648934
          type: new GraphQLNonNull(Queries),
          description: "Self-Pointer from Root to Root",
          resolve: function resolve() {
            return {};
          }
        }
      }, queries, {
        node: nodeField
      });
    }
  });

  var Mutations = new GraphQLObjectType({
    name: "Mutations",
    fields: _extends({}, mutations)
  });

  return new GraphQLSchema({
    query: Queries,
    mutation: Mutations
  });
};

module.exports = {
  getSchema: getSchema
};