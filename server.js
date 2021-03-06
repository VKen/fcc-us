'use strict';

var express = require('express');
var mongo = require('mongodb');
var mongoose = require('mongoose');
const bodyParser = require('body-parser')

const dns = require('dns').promises;
var URL = require('url');
var cors = require('cors');

var app = express();

// Basic Configuration
var port = process.env.PORT || 3000;

/** this project needs a db !! **/
mongoose.connect(process.env.DB, {useNewUrlParser: true, useFindAndModify: false});

// for using as increment counter identifier
const SEQUENCE_NAME = "url_sequence";

// schemas
const CounterSchema = new mongoose.Schema({
    _id: String,
    seq: Number,
})

const UrlSchema = new mongoose.Schema({
    _id: String,  // URL
    short_url: Number,
})

// models
const Counter = mongoose.model('Counter', CounterSchema);
const Url = mongoose.model('Url', UrlSchema);

var db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {
    console.log("mongodb connected");
    // check sequence db used for this app
    console.log(`checking for application-needed counter sequence: ${ SEQUENCE_NAME }`);
    const query = Counter.where({_id: SEQUENCE_NAME});
    query.findOne((err, counter) => {
        if (err) return console.error(`error querying for ${ SEQUENCE_NAME }!`);
        if (counter) {
            console.log(`found ${ SEQUENCE_NAME }! Continuing...`);
            // no need to do anything
        } else {
            console.log(`${ SEQUENCE_NAME } not found. Creating...`);
            let url_seq = new Counter({
                _id: SEQUENCE_NAME,
                seq: 0
            })
            url_seq.save((err, url_seq) => {
                if (err) return console.error(`error creating ${ SEQUENCE_NAME }!`);
                console.log(`created ${ SEQUENCE_NAME } successfully`)
            });
        }
    });

});

app.use(cors());

/** this project needs to parse POST bodies **/
// you should mount the body-parser here
// express 4.16.0 includes their own parser  express.json and express.urlencoded
// https://github.com/expressjs/express/blob/master/History.md#4160--2017-09-28
app.use(bodyParser.json()) // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true })) // for parsing application/x-www-form-urlencoded

app.use('/public', express.static(process.cwd() + '/public'));

app.get('/', function(req, res){
  res.sendFile(process.cwd() + '/views/index.html');
});


// your first API endpoint...
app.get("/api/hello", function (req, res) {
  res.json({greeting: 'hello API'});
});

// create new shorted url
app.post("/api/shorturl/new", async function (req, res) {
    let short_url, parsed_url;
    const target_url = req.body.url;
    const url = await Url.findById(target_url);

    if (url && url.short_url) {
        short_url = url.short_url;
    } else {
        // if no existing shortned url, do new shortening and get new short_url id-code
        try {
            parsed_url = new URL.URL(target_url);
        } catch (e) {
            return res.json({error:"invalid URL"});
        }
        // check for valid host name first
        try {
            const dns_check = await dns.lookup(parsed_url.hostname);

        } catch (e) {
            return res.json({error:"invalid Hostname"});
        }
        short_url = await getNextSequence(SEQUENCE_NAME);
        const new_url = new Url({
            _id: target_url,
            short_url: short_url,
        });
        await new_url.save();
    }
    res.json({
        original_url: target_url,
        short_url: short_url,
    });
});


app.get("/api/shorturl/:short_url", async function (req, res) {
    const code = req.params.short_url;
    const url = await Url.findOne({short_url: code});
    // if invalid or no such short code exists, return error
    if (!url) {
        return res.json({"error":"No short url found for given input"});
    }
    // example application returns {"error":"No short url found for given input"}
    res.redirect(url._id);
});

async function getNextSequence(name) {
    let counter = await Counter.findByIdAndUpdate(
        name,
        {
            $inc: { seq: 1 }
        },
        {
            new: true,
        },
    )
    return counter.seq;
}

app.listen(port, function () {
  console.log('Node.js listening ...');
});
