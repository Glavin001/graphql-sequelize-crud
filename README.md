# graphql-sequelize-crud

[![NPM](https://nodei.co/npm/graphql-sequelize-crud.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/graphql-sequelize-crud/)
[![NPM](https://nodei.co/npm-dl/graphql-sequelize-crud.png?months=3&height=3)](https://nodei.co/npm/graphql-sequelize-crud/)

[![Build Status](https://travis-ci.org/Glavin001/graphql-sequelize-crud.svg?branch=master)](https://travis-ci.org/Glavin001/graphql-sequelize-crud)

> Automatically generate queries and mutations from Sequelize models

---

| Demo |
| --- |
| See [`demo/index.js`](https://github.com/Glavin001/graphql-sequelize-crud/blob/master/demo/index.js) for demo source code. |
| The following is automatically generated from a simple Sequelize schema. ![graph](https://raw.githubusercontent.com/Glavin001/graphql-sequelize-crud/master/graph.png) Generated using [`graphql-viz`](https://github.com/sheerun/graphqlviz). |

## Installation

```bash
# Install Peer Dependencies
npm install --save graphql graphql-relay graphql-sequelize sequelize
# Install GraphQL-Sequelize-CRUD
npm install --save graphql-sequelize-crud
```

## Usage

See [`demo/index.js`](https://github.com/Glavin001/graphql-sequelize-crud/blob/master/demo/index.js) for demo source code.

```javascript
// Project Dependencies.
const Sequelize = require('sequelize');

// Optional: Use express-graphql.
const express = require('express');
const graphqlHTTP = require('express-graphql');
const app = express();

// Create Sequelize instance.
const sequelize = new Sequelize(/* configure Sequelize */);

// Define Sequelize models.
// See demo source code.
// ...

// Generate GraphQL Schema from Sequelize instance and models.
const schema = getSchema(sequelize);

// Optional: Create express-graphql server.
app.use('/graphql', graphqlHTTP({
  schema: schema,
  graphiql: true
}));
const port = 3000;
app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
```

## Why

- :white_check_mark: Less error prone development. No more keeping GraphQL in sync with Database fields.
- :white_check_mark: [Don't Repeat Yourself](https://en.wikipedia.org/wiki/Don%27t_repeat_yourself).
- :white_check_mark: Power of GraphQL and Relay with rapid database development of Sequelize

## Features
- [x] Generated GraphQL API only from Sequelize Models defintitions
  - [x] [Relay](https://facebook.github.io/relay/) compatiable GraphQL API
- [x] Generate Queries
  - [x] READ single
  - [x] READ all
- [ ] Generate Mutations
  - [x] CREATE
  - [x] UPDATE
  - [ ] DELETE
- [x] Custom queries and mutations within Sequelize Models defitions
