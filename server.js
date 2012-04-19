var url = require("url"),
    path = require("path"),
    fs = require("fs"),
    events = require("events"),
    logger = require('socket.io/lib/logger.js'),

	log = new logger(),
	cuid = 0,
	timerId = null,
	timerInterval = 200,
	wordfile = 'words-test.json',
	notifications = [],
	httpPort = 8090,
	wsPort = 8091,
	pwd = 'changeme';

// check for command line switches
if (process.argv.length > 2){
	for(var i=2; i<process.argv.length; i++){
		var arg = process.argv[i];
		if (arg.indexOf('=') > 0){
			var args = arg.split('=');
			switch(args[0]){
				case 'http':
				case 'httpPort':
					httpPort = parseInt(args[1],10);
					break;
				case 'ws':
				case 'wsPort':
					wsPort = parseInt(args[1],10);
					break;
				case 'pwd':
				case 'password':
					pwd = args[1];
					break;
				case 'wordfile':
					wordfile = args[1];
					break;
			}
		}
	}
}

fs.readFile(wordfile, function(err,data){
	if(err) {
		log.error("default words.json file not found: %s", err);
		process.exit(1);
	}
	defaultWords = JSON.parse(data);
});

// start listening
var io = require('socket.io').listen(wsPort);
var app = require('http').createServer(httpHandler).listen(httpPort);

log.info('Listening for HTTP requests on http://localhost:'+httpPort);
log.info('Listening for WS requests on http://localhost:'+wsPort);



/**
 * Object which represents a word
 * @param {text} text The text of the word
 * @param {int} x The starting x point
 * @param {int} y The starting y point
 */
function Word(text, x, y){
	this.text = text;
	this.x = x || 0;
	this.y = y || 0;
	this.locked = false;
	this.id = 'w' + uid();
}

/**
 * Generates a unique id
 * @return {int} The unique id
 */
function uid(){
	return cuid++;
}

/**
 * Gets the current state of the fridge
 * @param  {int} width	The width of the fridge
 * @param  {int} height The height of the fridge
 * @return {object}		The words
 */
function getCurrentState(width, height){
	if (!global.words){
		global.words = {};
		initBoard(defaultWords, width, height);
	}
	return global.words;
}

/**
 * Initializes the board and sets up the initial position (randomly) of all words
 * @param  {String|Array} str An array of words, or a space delimited string of words
 * @param  {int} width The fridge width
 * @param  {int} height The fridge height
 */
function initBoard(words, width, height){
	log.info('Init fridge (w:'+width+', h:'+height+') with word string: ' + words);
	if (!Array.isArray(words)){
		words = words.split(' ');
	}
	words.forEach(function(text){
		var x = Math.abs( (Math.floor(Math.random() * width) + 1) - 25);
		var y = Math.abs( (Math.floor(Math.random() * height) + 1) -25);
		var tmp = new Word(text, x, y);
		global.words[tmp.id] = tmp;
	});
}

/**
 * Serves a static file HTML/CSS/JS based on the given uri
 * @param  {string} uri The current request URI
 * @param  {ServerResponse} resp The HTTP server response object
 */
function serveStaticFile(uri, resp) {
	var	filename = path.join(process.cwd(), (uri == '/') ? '/index.html' : uri),
		extension = path.extname(filename),
		contentType = null;

	switch(extension){
		case '.js': contentType = 'text/javascript'; break;
		case '.css': contentType = 'text/css'; break;
		default: contentType = 'text/html'; break;
	}

	path.exists(filename, function(exists) {
		if(exists) {
			fs.readFile(filename, function(err, content) {
				if(err) {
					resp.writeHead(500);
					resp.end();
				} else {
					resp.writeHead(200, { 'Content-Type': contentType });
					resp.end(content, 'utf-8');
				}
			});
		} else {
			resp.writeHead(404, {"Content-Type": contentType});
			resp.write("404 Not Found\n");
			resp.end();
		}
	});
}

/**
 * The core http server function to handle incoming requests
 * @param  {ServerRequest} request The server request
 * @param  {ServerResponse} resp The server response
 */
function httpHandler(req, resp){
	var reqData = url.parse(req.url, true),
		uri = reqData.pathname,
		id = null,
		tmp = null,
		now = new Date();

	resp.json = function(data){
		var json = JSON.stringify(data);
		this.writeHead(200, {'Content-Type':'application/json'});
		this.write(json);
		this.end();
	};

	log.info('Http request start-  ' + now.toJSON());
	log.debug(reqData);

	switch(uri){
		case '/init':
			resp.json(getCurrentState());
			break;

		case '/lock':
			id = reqData.query.id;
			if (!global.words[id].locked){
				global.words[id].locked = true;
			}
			resp.json({id:id, locked:global.words[id].locked});
			break;

		default:
			serveStaticFile(uri, resp);
			break;
	}
}

/**
 * Set up the socket io functions on connection
 * @param  {socket} socket The web socket
 */
io.sockets.on('connection', function (socket) {

	/**
	 * Updates clients with a words current position
	 * @param  {Object} data The data
	 */
	var update = function(data){
		global.words[data.id].x = data.x;
		global.words[data.id].y = data.y;
		socket.broadcast.emit('update', JSON.stringify({
				id:data.id,
				path:data.path,
				duration:data.duration,
				locked:global.words[data.id].locked
			})
		);
	};

	/**
	 * Unlock a word so other users can drag it, also update it's position
	 * and broadcast the position to all other users
	 * @param  {object} data The socket request data
	 */
	socket.on('unlock', function(data){
		log.info('WS:/unlock', data);
		global.words[data.id].locked = false;
		update(data);
		
	});

	/**
	 * Emits a lock event to all listeners
	 * @param  {object} data The socket request data
	 */
	socket.on('lock', function(data){
		log.info('WS:/lock', data);
		socket.broadcast.emit('lock', data);
	});

	/**
	 * Triggers an update event to clients
	 * @param  {Object} data The WS request data
	 */
	socket.on('update', function(data){
		log.info('WS:/update', data);
		update(data);
	});

	/**
	 * Initialize the board for the client, new client connections will be given
	 * the current state of the board
	 * @param  {object} data The socket request data
	 */
	socket.on('init', function(data){
		log.info('WS:/init');
		socket.emit('init', getCurrentState(data.width, data.height));
	});

	/**
	 * Changes the words on the board, and updates all client boards
	 * @param  {object} data The socket request data
	 */
	socket.on('setwords', function(data){
		log.info('WS:/setwords', data);
		if (data.pwd == pwd){
			global.words = null;
			defaultWords = data.text;
			io.sockets.emit('setwords', getCurrentState(data.width, data.height));
		} else if (!data.pwd){
			log.warn('Cannot change words, no password provided');
			socket.emit('setwords', {error:'You must provide a password to change the words'});
		} else {
			log.warn('Client password does not match server password');
			socket.emit('setwords', {error:'Password does not match, please try again'});
		}
	});

});
