/*
 * Fridge Poetry Client
 * https://github.com/jusbell/Fridge-Poetry
 *
 * Copyright 2012, Justin Brydebell
 *
 * Licensed under the MIT license:
 * http://www.opensource.org/licenses/MIT
 */
(function(){

var interval = 200,
	update = interval * 2,
	liveUpdate = false, // expiramental
	broadcastLockEvent = true,
	zIndex = 1,
	maxZ = 1000,
	fridge = null,
	fridgeH = null,
	fridgeW = null,
	message = null,
	overlay = null,
	httpPort = 8090,
	wsPort = 8091,
	httpUrl = 'http://localhost:'+httpPort,
	wsUrl = 'http://localhost:'+wsPort,
	socket = io.connect(wsUrl);

/**
 * Returns the current time in ms
 * @return {Number} The current time
 */
function now(){
	return new Date().getTime();
}

/**
 * Request to lock the current word. This call is synchronous so that a client
 * cannot start to drag before knowing if the word is locked.
 */
function canMove(){
	var isLocked = $(this).hasClass('locked');
	if (!isLocked){
		$.ajax(httpUrl+'/lock', {
			data:{id:this.id},
			dataType:'json',
			async:false,
			success:function(data){
				isLocked = data.locked;
				if (broadcastLockEvent){
					socket.emit('lock', data);
				}
			}
		});
		return isLocked;
	} else {
		return !isLocked;
	}
	
}

/**
 * Initialize the words on the fridge, and set up some event handlers
 * @param  {Object} data The initialization data
 */
function init(data){
	for(var i in data){
		var def = data[i];
		var tmp = $('<span>').addClass('word')
			.prop('id', i)
			.prop('draggable', true)
			.css({ top:def.y, left:def.x })
			.text(def.text);

		$('#fridge').append(tmp);
	}

	$('[draggable]').each(function(){
		var me = $(this);
		me.data('height', me.outerHeight());
		me.data('width', me.outerWidth());
		me[0].style.zIndex = zIndex++;
	})
	.on('dragstart', DragHandler.onStart)
	.on('drag', {relative:true}, DragHandler.onDrag)
	.on('dragend', DragHandler.onEnd );
}


/**
 * Move the words along a given path
 * @param  {Object} data Data associated with the move event
 */
function moveWords(data){
	var arr = JSON.parse(data);
	if (!$.isArray(arr)){
		arr = [arr];
	}
	for(var i=0; i<arr.length; i++){
		var el = $('#'+arr[i].id);

		el.animate({crSpline: $.crSpline.buildSequence(arr[i].path)}, arr[i].duration, (function(isLocked){
			return function(){
				if (!isLocked && $(this).hasClass('locked')){
					$(this).removeClass('locked');
				}
			};
		})(arr[i].locked));

	}
}

/**
 * Sets words for all connected clients, a password must be provided.
 * @param {String} sentence The words
 * @param {pwd} pwd The password
 */
function setWords(sentence, pwd){
	socket.emit('setwords', {text:sentence, width:fridgeW, height:fridgeH, pwd:pwd});
}

/**
 * Change the words on the screen for all users. If there was an error while changing
 * the words, the user that initiated the chagne will see the error and nothing will happen.
 * @param  {Object} data New initialization data, or an error
 */
function changeWords(data){
	var hideOverlay = function(){
		message.fadeOut('fast', function(){
			overlay.fadeOut('fast');
		});
	};

	var msg = data.error ? data.error : 'Loading new words...';
	var timeout = 1000;
	var fn = data.error ? hideOverlay : function(){
			$('#fridge').html('');
			init(data);
			hideOverlay();
		};
	

	if (data.error){
		$('p', message).addClass('error');
	} else {
		$('p', message).removeClass('error');
	}

	$('p', message).html(msg);
	overlay.fadeIn('fast', function(){
		message.fadeIn('fast', function(){
			setTimeout(fn, timeout);
		});
	});
}

/**
 * Represents a point on the fridge
 * @param {Object} dd The drag/drop event object
 */
function Point(dd){
	this.left = Math.min( dd.limit.right, Math.max( dd.limit.left, dd.offsetX ) );
	this.top = Math.min( dd.limit.bottom, Math.max( dd.limit.top, dd.offsetY ) );
}

/**
 * A container for drag and drop handler functions
 * @type {Object}
 */
var DragHandler = {
	onStart:function(e, dd){
		var isMoveable = canMove.call(this);

		var me = $(this);
		if (!isMoveable){
			dd.cancel = true;
		}

		me.data('oldZ', this.style.zIndex);
		this.style.zIndex = maxZ;
		$(this).addClass('dragging');

		dd.startTime = new Date().getTime();
		dd.intervalTime = dd.startTime;
		dd.updateTime = dd.startTime;

		dd.path = [[dd.originalX, dd.originalY]];

		dd.limit= {top:0, left:0};
		dd.limit.bottom = fridgeH - $(this).data('height')-2;
		dd.limit.right = fridgeW - $(this).data('width')-2;
	},

	onDrag:function(e, dd){
		if (dd.cancel) return;
		
		var point = new Point(dd);

		this.style.top = point.top + 'px';
		this.style.left = point.left + 'px';

		if (!$.isArray(dd.path)){
			dd.path=[];
		}

		// add a point at the configured update interval
		var ctime = now();
		if ((ctime - dd.intervalTime) > interval){
			dd.intervalTime = ctime;
			dd.path.push([point.left, point.top]);
		}

		// live update, this is an expiramental feature...
		/*
		if (liveUpdate && (ctime - dd.updateTime) > update){
			console.debug('live update');
			dd.updateTime = now();
			socket.emit('update', {
				id: this.id,
				x: point.left,
				y: point.top,
				duration: dd.updateTime - dd.startTime,
				path: dd.path
			});

			dd.updateTime = dd.startTime = ctime;
			dd.path=[];
		}
		*/
	},

	onEnd:function(e, dd){
		if (dd.cancel) return;
		
		var point = new Point(dd);

		this.style.zIndex = $(this).data('oldZ');
		$(this).removeClass('dragging');

		dd.endTime = now();
		dd.path.push([point.left, point.top]);

		// Emit the unlock message which will update all connected clients
		socket.emit('unlock', {
			id: this.id,
			x: point.left,
			y: point.top,
			duration: dd.endTime - dd.startTime,
			path: dd.path
		});
	}
};

$(function(){
	overlay = $('#overlay').hide();
	message = $('#message').hide();
	fridge = $('#fridge');
	fridgeH = fridge.outerHeight();
	fridgeW = fridge.outerWidth();

	socket.on('init', init);
	socket.on('update', moveWords);
	socket.on('setwords', changeWords);
	socket.on('lock', function(data){
		if (data.locked){
			$('#'+data.id).addClass('locked');
		}
	});
	
	socket.emit('init', {width:fridgeW, height:fridgeH});
});

// expose setWords so it can be run from the javascript console
window.setWords = setWords;

})(jQuery);