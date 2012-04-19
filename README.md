What and why
------------

Why not? Seemed like a good way to expirament with the capabilities of node.js, HTML5 WebSockets, and real-time web applications.

Starting the server
-------------------

Go to the project directory in a terminal and type the following command.

	node server.js [http=<port>] [ws=<port>] [wordfile=<path>]

###Program arguments

1. **http | httpPort** = Server port for http requests (default is 8090)
2. **ws | wsPort** = Server port for web socket requests (default is 8091) _Note that if you change the web socket port, the parameter will also need to be changed in the index.html file_
3. **wordfile** = A JSON file which contains the words to be used in the game

How to play
-----------

Open up the game by navigating to the url http://localhost:8090 (or the http port specified in the program arguments), and start dragging around some words. Try opening up a couple browsers and watch what happens. Try with a couple friends. Have Fun! 

_Tested on latest version of Chrome/FireFox/IE_

What's next
-----------

1. Make it more real-time (see words move as another user moves them, instead of after they drop them) without sacrificing performance.
2. Not quite sure yet...


 