var express = require("express.io");
var Boom = require("boom");
var onFinished = require("on-finished");
var bodyParser = require("body-parser");
var _ = require("lodash");

var pkg = require("./package.json");


var app = express();

var nextReqId = (function () {
  var id = 0;
  return function () {
    id++;
    return id;
  };
})();

app.use(bodyParser());

app.use(function (req, res, next) {
  req._startAt = process.hrtime();
  req._startTime = new Date();
  onFinished(res, function () {
    var diff = process.hrtime(req._startAt);
    var ms = diff[0] * 1e3 + diff[1] * 1e-6;
    var elapsed = ms.toFixed(3);
    console.log("%s [%s] - %s %s %s (%sms)",
                req._startTime.valueOf(),
                req.headers["X-RequestId"],
                req.method,
                req.path,
                res.statusCode,
                elapsed);
  });
  next();
});

app.use(function (req, res, next) {
  var id = nextReqId();
  req.headers["X-RequestId"] = id;
  res.setHeader("X-RequestId", id);
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

app.get("/*", function (req, res, next) {
  var addr = server.address();
  var loc = req.protocol + "://" + req.hostname + (addr.port == 80 ? "" : ":"+ addr.port) +"/";
  res.status(301)
    .location(loc)
    .send({ ok: true, location: loc });
});

app.use(function (err, req, res, next) {
  if (err.isBoom) {
    console.log("%s [%s] - ERR %s - %s",
                req._startTime.valueOf(),
                req.headers["X-RequestId"],
                err.output.statusCode,
                err.message);
    return res.status(err.output.statusCode)
      .send(err);
  }
  console.log("%s [%s] - ERR", new Date().valueOf(), req.headers["X-RequestId"], err.stack);
  return res.status(500).send({ statusCode: 500, error: "Server Error" });
});




var server = app.listen(process.env.PORT || 3001, function () {
  console.log("server listening on %s:%s", server.address().address, server.address().port);
});

