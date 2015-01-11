var express = require("express.io");
var Boom = require("boom");
var onFinished = require("on-finished");
var BodyParser = require("body-parser");
var _ = require("lodash");
var rollbar = require("rollbar");
var pkg = require("./package.json");


var app = express();

var nextReqId = (function () {
  var id = 0;
  return function () {
    id++;
    return id;
  };
})();

app.use(BodyParser.json());



app.use(function (req, res, next) {
  req._startAt = process.hrtime();
  req._startTime = new Date();
  onFinished(res, function () {
    var diff = process.hrtime(req._startAt);
    var ms = diff[0] * 1e3 + diff[1] * 1e-6;
    var elapsed = ms.toFixed(3);
    console.log("%s [%s] - %s %s %s (%sms)",
                req._startTime.valueOf(),
                req._requestId,
                req.method,
                req.path,
                res.statusCode,
                elapsed);
  });
  next();
});

app.use(function (req, res, next) {
  req._requestId = nextReqId();
  res.setHeader("X-RequestId", req._requestId);
  next();
});

app.get("/", function (req, res, next) {
  res.send({
    ok: true,
    app: pkg.name,
    version: pkg.version,
    uptime: process.uptime() +"s",
    ts: new Date()
  });
});

var Users = {};
app.get("/user/:id", function (req, res, next) {
    if (!Users[req.params.id]) {
      throw Boom.notFound("user not found", {id: req.params.id});
    }
    req.user = Users[req.params.id];
    next();
  },
  function (req, res, next) {
    res.send(req.user);
  });

app.post("/user", function (req, res, next) {
  var nextId = _.keys(Users).length;
  var meta = { id: nextId, created: req._startTime,  };
  var user = _.extend(_.clone(req.body), meta);
  Users[nextId] = user;
  res.status(201).send(user);
});

app.get("/user", function (req, res, next) {
  res.send(_.toArray(Users));
});

app.get("/throw", function (req, res, next) {
  throw new Boom.badImplementation(req.query.err || "BOOM!! thrown");
});

app.get("/next", function (req, res, next) {
  next(new Boom.badImplementation(req.query.err || "BOOM!! next"));
});

app.get("/error", function (req, res, next) {
  throw new Error("intentional error");
});

app.get("/*", function (req, res, next) {
  var addr = server.address();
  var loc = req.protocol + "://" + (req.hostname || "0.0.0.0") + (addr.port == 80 ? "" : ":"+ addr.port) +"/";
  loc = process.env.HEROKU_URL || loc;
  res.status(301)
    .location(loc)
    .send({ ok: false, location: loc });
});

var notify = function (message) {
  console.log("%s [ ] - INFO - %s", new Date().valueOf(), message)
};

if (process.env.ROLLBAR_ACCESS_TOKEN) {
  rollbar.init("bfcfe60b41bd4e32b5f711d780fb7538");
  notify = function (message) {
    rollbar.reportMessage(message);
  };
  app.use(rollbar.errorHandler(process.env.ROLLBAR_ACCESS_TOKEN));
}

app.use(function (err, req, res, next) {
  if (err.isBoom) {
    console.log("%s [%s] - ERR %s - %s",
                req._startTime.valueOf(),
                req._requestId,
                err.output.statusCode,
                err.message);
    return res.status(err.output.statusCode)
      .send(err);
  }
  console.log("%s [%s] - ERR", new Date().valueOf(), req._requestId, err.stack);
  // return res.status(500).send({ statusCode: 500, error: "Server Error" });
  next(err);
});

var server = app.listen(process.env.PORT || 3001, function () {
  if (process.env.HEROKU_URL) {
    console.log("server listening on", process.env.HEROKU_URL);
  } else {
    console.log("server listening on %s:%s",
                server.address().address, server.address().port);
  }
  notify("service started OK");
});

