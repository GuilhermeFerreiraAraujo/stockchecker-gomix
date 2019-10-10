
'use strict';

var expect = require('chai').expect;
var MongoClient = require('mongodb').MongoClient;
const https = require('https')
var db;
const CONNECTION_STRING = process.env.DB;
const apiKey = process.env.ALPHAVANTAGEAPIKEY;

module.exports = function (app) {

  MongoClient.connect(CONNECTION_STRING, function (err, dbo) {
    if (err) {
      console.log('Error connecting db', err);
    } else {
      console.log('Database Connected');
      db = dbo.db('Stocks');
    }
  });

  function getStock(stock) {
    const apiFunction = 'GLOBAL_QUOTE';
    return new Promise(function (resolve, reject) {
      https.get('https://www.alphavantage.co/query?function=' + apiFunction + '&symbol=' + stock + '&apikey=' + apiKey, (response) => {
        let toReturn = '';

        response.on('data', (chunk) => {
          toReturn += chunk;
        });

        response.on('end', () => {
          resolve(toReturn);
        });
      })
        .on("error", (error) => {
          console.log("Error: " + error.message);
          reject(error.message);
        });
    });
  }

  function saveRecords(res, like, stock) {
    var promise1;
    var promise2;

    if (stock) {
      if (typeof stock === 'string' || stock instanceof String) {
        promise1 = getStock(stock);
      } else {
        promise1 = getStock(stock[0]);
        promise2 = getStock(stock[1]);
      }

      promise1.then(stock1 => {
        if (promise2) {
          promise2.then(stock2 => {
            stock1 = JSON.parse(stock1);
            var stockSymbol1 = stock1["Global Quote"]['01. symbol'];
            var stockPrice1 = stock1["Global Quote"]['05. price'];
            var incLike = 0;
            if (like) {
              incLike = 1;
            }

            db.collection('Stocks').findOneAndUpdate({ symbol: stockSymbol1 },
              {
                $inc: { "likes": incLike },
                $set: { "symbol": stockSymbol1, price: stockPrice1 }
              },
              { upsert: true, returnOriginal: false },
              function (err, document1) {
                console.log(err);

                stock2 = JSON.parse(stock2);
                var stockSymbol2 = stock2["Global Quote"]['01. symbol'];
                var stockPrice2 = stock2["Global Quote"]['05. price'];

                db.collection('Stocks').findOneAndUpdate({ symbol: stockSymbol2 },
                  {
                    $inc: { "likes": incLike },
                    $set: { "symbol": stockSymbol2, price: stockPrice2 }
                  },
                  { upsert: true, returnOriginal: false },
                  function (err, document2) {

                    var result1 = {
                      symbol: document1.value.symbol,
                      rel_likes: document1.value.likes - document2.value.likes,
                      price: document1.value.price
                    };

                    var result2 = {
                      symbol: document2.value.symbol,
                      rel_likes: document2.value.likes - document1.value.likes,
                      price: document2.value.price
                    };
                    var documents = [result1, result2];
                    res.json({ stockdata: documents });
                  }
                );
              }
            );

          });
        } else {
          //var stock = stock1['Global Quote'];
          stock1 = JSON.parse(stock1);
          var symbol = stock1["Global Quote"]['01. symbol'];
          var price = stock1["Global Quote"]['05. price'];

          var incLike = 0;
          if (like) {
            incLike = 1;
          }

          db.collection('Stocks').findOneAndUpdate({ symbol: symbol },
            {
              $inc: { "likes": incLike },
              $set: { "symbol": symbol, price: price }
            },
            { upsert: true, returnOriginal: false },
            function (err, document) {
              res.json({ stockdata: document.value });
            }
          );
        }
      });
    }

  }

  app.route('/api/stock-prices')
    .get(function (req, res) {
      var stock = req.query.stock;
      var like = req.query.like;

      if (like) {
        var ip = req.connection.remoteAddress;
        var myDocument = db.collection('Ips').findOne({ ip: ip }).then(result => {
          if (result) {
            like = false;
          } else {
            db.collection('Ips').insertOne({ ip: ip });
          }
          saveRecords(res, like, stock);
        });
      } else {
        saveRecords(res, like, stock);
      }
    });
};
