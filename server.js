'use strict';

const cors = require('cors');
const express = require('express');

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
const app = express();
const server = app.listen(PORT, () => console.log(`Listening on ${ PORT }`));

app.use(cors());
app.options('*', cors());
app.get('/data', function (req, res, next) {
  docClient.scan({TableName : 'tree'}, (error, data) => {
    res.send(data);
    next()
  })
})
const io = require('socket.io')(server);
io.on('connection', (ws) => {
  // grab data from dynamo, send them over on connection
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
          ws.emit('message', JSON.stringify(Object.assign({ type: 'error' }, error)));
          return;
        }
        ws.broadcast.emit('message', data);
      });
    } else if (parsedData.type === 'delete') {
      docClient.delete({
        TableName : 'tree',
        Key:{
          "UserName": parsedData.id,
        },
      }, function(err) {
        if (err) {
          console.error("Unable to delete item. Error JSON:", JSON.stringify(err, null, 2));
        }
        ws.broadcast.emit('delete', data);
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
      docClient.update(params, (error, res) => {
        if(error) {
          ws.emit('message', JSON.stringify(Object.assign({ type: 'error' }, error)));
          return;
        }
        ws.broadcast.emit('message', data);
      });
    }
  });
  ws.on('close', function () {
  })
});

