
/**
 * Chat.
 */

var crypto = require('crypto');
var url = require('url');
var querystring = require('querystring');

// Configuration

var configuration = {
  salt: Math.random().toString(),
  handleMaxLength: 32,
  avatars: ['bacula', 'kanra', 'saika', 'setton', 'taro_tanaka'],
  sessionClearInterval: 1000,
  sessionTimeout: 60000,
  callbackClearInterval: 3000,
  callbackTimeout: 30000,
  messageMaxLength: 128,
  messageBackLog: 64,
  logChannel: false
};

var app = module.parent.exports;

app.configure('development', function() {
  configuration.logChannel = true;
});

// Session

var sessions = {};
var sessionGeneration = 0;

var Session = exports.Session = function(handle, avatar, destroyCallbacks) {
  handle = handle.trim();

  if (handle.length === 0) {
    this.error = ["Handle can't be blank.", 400];
    return;
  } else if (handle.length > configuration.handleMaxLength) {
    this.error = ["Handle too long.", 400];
    return;
  }

  if (!configuration.avatars.some(function(value) {
    return avatar === value;
  })) {
    this.error = ["Invalid avatar.", 400];
    return;
  }

  var handleConflict = false;
  var avatarConflict = false;

  for (var id in sessions) {
    var session = sessions[id];

    handleConflict = (handle === session.handle) || handleConflict;
    avatarConflict = (avatar === session.avatar) || avatarConflict;
  }

  if (handleConflict) {
    this.error = ["Handle in use.", 409];
    return;
  }

  if (avatarConflict) {
    this.error = ["Avatar in use.", 409];
    return;
  }

  do {
    var hash = crypto.createHash('md5');

    hash.update(sessionGeneration.toString() + configuration.salt);
    sessionGeneration += 1;

    this.id = hash.digest('hex');
  } while (this.id in sessions)

  this.handle = handle;
  this.avatar = avatar;
  this.destroyCallbacks = destroyCallbacks;
  this.time = (new Date()).getTime();

  sessions[this.id] = this;
};

Session.prototype.touch = function() {
  this.time = (new Date()).getTime();
}

Session.prototype.destroy = function(timedOut) {
  delete sessions[this.id];

  if (this.destroyCallbacks) {
    if (timedOut) {
      if (this.destroyCallbacks.timeout) {
        this.destroyCallbacks.timeout();
      }
    } else {
      if (this.destroyCallbacks.part) {
        this.destroyCallbacks.part();
      }
    }
  }
}

Session.prototype.pack = function() {
  return {
    id: this.id,
    handle: this.handle,
    avatar: this.avatar
  };
}

setInterval(function() {
  var now = (new Date()).getTime();

  for (var id in sessions) {
    var session = sessions[id];

    if (now - session.time > configuration.sessionTimeout) {
      session.destroy(true);
    }
  }
}, configuration.sessionClearInterval);

// Channel

var Channel = exports.Channel = function(logCallback) {
  var self = this;

  this.logCallback = logCallback;

  this.messages = [];
  this.callbacks = [];

  setInterval(function() {
    var now = (new Date()).getTime();

    while (self.callbacks.length > 0 && now - self.callbacks[0].time > configuration.callbackTimeout) {
      self.callbacks.shift().callback([]);
    }
  }, configuration.callbackClearInterval);
}

Channel.prototype.appendMessage = function() {
  arguments = Array.prototype.slice.call(arguments);

  if (arguments.length < 1 || arguments.length > 3) {
    return;
  }

  var message = {
    time: (new Date()).getTime()
  };

  var errorCallback;

  if (typeof arguments.slice(-1) === 'function') {
    errorCallback = arguments.pop();
  }

  if (arguments.length > 1 ) {
    message.handle = arguments[0].handle;
    message.avatar = arguments[0].avatar;
    message.text = arguments[1];
  } else {
    message.text = arguments[0];
  }

  if (errorCallback && message.text.length > configuration.messageMaxLength) {
    errorCallback("Message too long.", 400);
    return;
  }

  this.messages.push(message);

  while (this.callbacks.length > 0) {
    this.callbacks.shift().callback([message]);
  }

  while (this.messages.length > configuration.messageBackLog) {
    this.messages.shift();
  }

  this.logCallback(message);
}

Channel.prototype.query = function(time, callback) {
  var matches = this.messages.filter(function(message) {
    return message.time > time;
  });

  if (matches.length > 0) {
    callback(this.messages);
  } else {
    this.callbacks.push({
      callback: callback,
      time: (new Date()).getTime()
    });
  }
}

var channel = new Channel(function(message) {
  if (configuration.logChannel) {
    if (message.handle) {
      console.log("<" + message.handle + "> " + message.text);
    } else {
      console.log("-- " + message.text);
    }
  }
});

// Routes

app.post('/join', function(req, res) {
  if (!req.body || !(req.body.handle && req.body.avatar)) {
    res.send("Insufficient parameters.", 400);
    return;
  }

  var session = new Session(req.body.handle, req.body.avatar, {
    timeout: function() {
      channel.appendMessage(session.handle + " timed out.");
    },
    part: function() {
      channel.appendMessage(session.handle + " parted the chat room.");
    }
  });

  if (session.error) {
    res.send(session.error[0], session.error[1]);
    return;
  }

  channel.appendMessage(session.handle + " joined the chat room.");

  res.send(session.pack());
});

app.get('/recv', function(req, res) {
  var query = querystring.parse(url.parse(req.url).query);

  if (!(query.id && query.time)) {
    res.send("Insufficient parameters.", 400);
    return;
  }

  var session = sessions[query.id];

  if (!session) {
    res.send("Invalid id.", 403);
    return;
  }

  session.touch();

  var time = parseInt(query.time, 10);

  channel.query(time, function(messages) {
    if (session) {
      session.touch();
      res.send(messages);
    }
  });
});

app.post('/post', function(req, res) {
  if (!req.body || !(req.body.id && req.body.text)) {
    res.send("Insufficient parameters.", 400);
    return;
  }

  var session = sessions[req.body.id];

  if (!session) {
    res.send("Id is invalid.", 403);
    return;
  }

  session.touch();

  channel.appendMessage(session, req.body.text, function(error, status) {
    res.send(error, status);
    return;
  });

  res.send();
});

app.post('/part', function(req, res) {
  if (!req.body || !req.body.id) {
    res.send("Insufficient parameters.", 400);
    return;
  }

  var session = sessions[req.body.id];

  if (!session) {
    res.send("Id is invalid.", 403);
    return;
  }

  session.destroy();
});
