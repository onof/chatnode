var http = require('http'), 
     url = require('url'),
	 GridStore = require('mongodb').GridStore;
	 
var MongoClient = require('mongodb').MongoClient
var dbUrl = 'mongodb://localhost:27017/htmlitmessenger';

var withData = function (request, response, callback) {
    if (request.method == 'POST') {
        var body = '';
        request.on('data', function (data) {
            body += data;
            if (body.length > 1e6) { 
                request.connection.destroy();
            }
        });
        request.on('end', function () {
            var postedData = JSON.parse(body);
            callback(postedData);
        });
    }
	else {
		response.writeHead(403, {'Content-Type': 'text/plain'});
		response.end("Invalid request");
	}
}

var Token = {};
Token.generate = function(user) {
	// TODO: generate a token with some algorithm.
	return user.email;
}
Token.validate = function(token) {
	// TODO: validate the token and return the user
	return token;
}

var auth = function(request, response) {
	withData(request, response, function(postedData) {
		MongoClient.connect(dbUrl, function(err, db) {
			var collection = db.collection('users');	
			collection.find({email: postedData.email, password: postedData.password}).toArray(function(err, docs) {
				if(docs.length == 1) {
					response.writeHead(200, {'Content-Type': 'text/plain'});
					response.end(Token.generate(docs[0]));
				}
				else {
					response.writeHead(401, {'Content-Type': 'text/plain'});
					response.end("Invalid user");
				}
			});
		});
	});
};

var register = function(request, response) {
	var checkData = function(postedData, onError) {
		if(! postedData.email) return onError("e-mail is required");
		return true;
	}
	
	withData(request, response, function(postedData) {
		
		if(checkData(postedData, function(msg) { response.writeHead(400, {'Content-Type': 'text/plain'}); response.end(msg); })) 
		{
			MongoClient.connect(dbUrl, function(err, db) {
				var collection = db.collection('users');	
				collection.insertOne(
				{ 
				name: postedData.name,
				email: postedData.email,
				password: postedData.password
				},
				function(error, result) {
					response.writeHead(error ? 400 : 200, {'Content-Type': 'application/json'});
					response.end(JSON.stringify(error || result));
				});		
			});
		}
		
		
	});
}

var checkAuth = function(postedData) {
	postedData.sender = Token.validate(postedData.token);
	return postedData.sender;
}

var Messages = {};
Messages.checkData = function(postedData, onError) {
	if(! checkAuth(postedData)) return onError("Authentication failed");
	if(! postedData.userDest) return onError("Recipient is required");
	return true;
};

var send = function(request, response) {
	withData(request, response, function(postedData) {
		if(Messages.checkData(postedData, function(msg) { response.writeHead(400, {'Content-Type': 'text/plain'}); response.end(msg); })) 
		{
			MongoClient.connect(dbUrl, function(err, db) {
				var collection = db.collection('messages');	
				collection.insertOne(
				{ 
				sender: postedData.sender,
				userDest: postedData.userDest,
				message: postedData.message
				},
				function(error, result) {
					response.writeHead(error ? 400 : 200, {'Content-Type': 'application/json'});
					response.end(JSON.stringify(error || result));
				});
			});
		}
	});
}

var sendPhoto = function(request, response) {
	var uniqueName = function(postedData) {
		// TODO: use GUID
		return "" + new Date().getTime();
	};
	
	var checkData = function(postedData, onError) {
		if(! Messages.checkData(postedData, onError)) return false;
		if(! postedData.data) return onError("No data");
		return true;
	};
	
	withData(request, response, function(postedData) {
		if(checkData(postedData, function(msg) { response.writeHead(400, {'Content-Type': 'text/plain'}); response.end(msg); })) 
		{
			var buffer = new Buffer(postedData.data, "base64");
				
			MongoClient.connect(dbUrl, function(err, db) {
				if(! err) {
					var gs = new GridStore(db, uniqueName(postedData) + ".png", "w", {
						content_type: "image/png",
						metadata: {
							userDest: postedData.userDest,
							author: postedData.author
						},
						chunk_size: 1024
					});
				
					gs.open(function(err, file) {
						if(! err) {
						file.write(buffer, function(err, store) {
							store.close();
							response.writeHead(err ? 400 : 200, {'Content-Type': 'application/json'});
							response.end(JSON.stringify(err));
							});
						}
						else {
							response.writeHead(400, {'Content-Type': 'application/json'});
							response.end(JSON.stringify(err));
						}
					});
					return;
				}
				response.writeHead(400, {'Content-Type': 'application/json'});
				response.end(JSON.stringify(err));
			});
		}
	});
}


var handlers = [];
handlers["/register"] = register;
handlers["/auth"] = auth;
handlers["/send"] = send;
handlers["/sendPhoto"] = sendPhoto;

http.createServer(function (request, response) {
  var url_parts = url.parse(request.url);
  var func = url_parts.pathname;
  
  if(handlers[func])
	  handlers[func](request, response);
  else{
		response.writeHead(404, {'Content-Type': 'text/plain'});
		response.end("Unknown: " + url_parts.pathname);
		return;
  }
}).listen(8124);

console.log('Server running at http://127.0.0.1:8124/');
