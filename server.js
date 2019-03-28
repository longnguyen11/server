'use strict';

const express = require('express');
const WebSocket = require('ws');
const SocketServer = WebSocket.Server;
const path = require('path');
const AWS = require('aws-sdk');
const config = require('./config/config.js');
AWS.config.update(config.aws_remote_config);
const docClient = new AWS.DynamoDB.DocumentClient();
const PORT = process.env.PORT || 3000;
const params = {
  TableName: config.aws_table_name
};
const dataAttribute = {
  name: 'DisplayName',
  min: 'MinimumRange',
  max: 'MaximumRange',
  data: 'RandomGenerateData'
};
const server = express()
  .listen(PORT, () => console.log(`Listening on ${ PORT }`));

const wss = new SocketServer({ server });
wss.on('connection', (ws) => {
  // grab data from dynamo, send them over on connection
  docClient.scan({TableName : 'tree'}, (error, data) => {
    if(error) {
      ws.send(JSON.stringify(Object.assign({ type: 'error' }, error)));
      return;
    }
    ws.send(JSON.stringify(data));
  })
  ws.on('message', function incoming(data) {
    let parsedData;
    try {
      parsedData=JSON.parse(data);
    } catch (e) {

    }
    if(parsedData.type === 'add') {
      docClient.put({
        TableName : 'tree',
        Item: {
          UserName: parsedData.id,
          TimeLastUpdate: Date.now(),
          MinimumRange: parsedData.min,
          MaximumRange: parsedData.max,
          DisplayName: parsedData.name,
          RandomGenerateData: JSON.stringify(parsedData.data),
        }
      }, (error) => {
        if(error) {
          ws.send(JSON.stringify(Object.assign({ type: 'error' }, error)));
          return;
        }
        wss.clients.forEach(function each(client) {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(data);
          }
        });
      });
    } else {
      let temp = [];
      let ExpressionAttributeValues = {};
      Object.keys(dataAttribute).forEach((attribute) => {
        if(parsedData[attribute]){
          temp.push(`${dataAttribute[attribute]} = :${attribute}`);
          if(attribute === 'data') {
            ExpressionAttributeValues[`:${attribute}`] = JSON.stringify(parsedData[attribute]);
          } else {
            ExpressionAttributeValues[`:${attribute}`] = parsedData[attribute];
          }
        }
      })
      let UpdateExpression = `set ${temp.join(', ')}`;
      const params = {
        TableName : 'tree',
        Key:{
          "UserName": parsedData.id,
        },
        UpdateExpression,
        ExpressionAttributeValues,
        ReturnValues:"UPDATED_NEW"
      };
      console.log(params)
      docClient.update(params, (error, res) => {
        console.log(error, res);
        if(error) {
          ws.send(JSON.stringify(Object.assign({ type: 'error' }, error)));
          return;
        }
        wss.clients.forEach(function each(client) {
          if (client !== ws && client.readyState === WebSocket.OPEN) {
            client.send(data);
          }
        });
      });
    }
  });
  ws.on('close', function () {
    console.log('deleted: ')
  })
});

