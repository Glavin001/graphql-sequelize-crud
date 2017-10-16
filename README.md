# graphql-sequelize-crud

> Automatically generate queries and mutations from Sequelize models

[![Build Status](https://travis-ci.org/Glavin001/graphql-sequelize-crud.svg?branch=master)](https://travis-ci.org/Glavin001/graphql-sequelize-crud)
[![Maintainability](https://api.codeclimate.com/v1/badges/79e165804f479d9c4c6a/maintainability)](https://codeclimate.com/github/Glavin001/graphql-sequelize-crud/maintainability)
[![Test Coverage](https://api.codeclimate.com/v1/badges/79e165804f479d9c4c6a/test_coverage)](https://codeclimate.com/github/Glavin001/graphql-sequelize-crud/test_coverage)

[![NPM](https://nodei.co/npm/graphql-sequelize-crud.png?downloads=true&downloadRank=true&stars=true)](https://nodei.co/npm/graphql-sequelize-crud/)

---

| Demo |
| --- |
| See [`demo/index.ts`](https://github.com/Glavin001/graphql-sequelize-crud/blob/master/demo/index.ts) for demo source code. |
| The following is automatically generated from a simple Sequelize schema. ![graph](https://raw.githubusercontent.com/Glavin001/graphql-sequelize-crud/master/graph.png) Generated using [`graphql-viz`](https://github.com/sheerun/graphqlviz). |

## Installation

```bash
# Install Peer Dependencies
npm install --save graphql graphql-relay graphql-sequelize-teselagen sequelize
# Install GraphQL-Sequelize-CRUD
npm install --save graphql-sequelize-crud
```

## Usage

See [`demo/index.ts`](https://github.com/Glavin001/graphql-sequelize-crud/blob/master/demo/index.ts) for demo source code.

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
- [x] Generate Mutations
  - [x] CREATE
  - [x] UPDATE
  - [x] DELETE
- [x] Custom queries and mutations within Sequelize Models defitions
