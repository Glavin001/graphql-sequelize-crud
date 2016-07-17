# graphql-sequelize-crud [![Build Status](https://travis-ci.org/Glavin001/graphql-sequelize-crud.svg?branch=master)](https://travis-ci.org/Glavin001/graphql-sequelize-crud)

[![NPM](https://nodei.co/npm/graphql-sequelize-crud.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/graphql-sequelize-crud/)
[![NPM](https://nodei.co/npm-dl/graphql-sequelize-crud.png?months=3&height=3)](https://nodei.co/npm/graphql-sequelize-crud/)

> Automatically generate queries and mutations from Sequelize models

---

| Demo |
| --- |
| See [`demo/index.js`](https://github.com/Glavin001/graphql-sequelize-crud/blob/master/demo/index.js) for demo source code. |
| The following is automatically generated from a simple Sequelize schema. ![graph](https://raw.githubusercontent.com/Glavin001/graphql-sequelize-crud/master/graph.png) Generated using [`graphql-viz`](https://github.com/sheerun/graphqlviz). |

## Why

- Less error prone development. No more keeping GraphQL in sync with Database fields.
- [Don't Repeat Yourself](https://en.wikipedia.org/wiki/Don%27t_repeat_yourself).
- Power of GraphQL and Relay with rapid database development of Sequelize

## Features
- [x] Generated GraphQL API only from Sequelize Models defintitions
  - [x] [Relay](https://facebook.github.io/relay/) compatiable GraphQL API
- [x] Generate Queries
  - [x] READ single
  - [x] READ all
- [ ] Generate Mutations
  - [x] CREATE
  - [ ] UPDATE
  - [ ] DELETE
- [x] Custom queries and mutations within Sequelize Models defitions
