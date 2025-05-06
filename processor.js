var default_calibration = {
	x1: 800,
	y1: 540,
	x2: 1120,
	y2: 540,
	width: 21
};
var calibration = {};

var track = [];
var currentTrackPoint = undefined;
var trackingPointStart;
var trackingMouseStart;
var trackingMoveMul = 1;
var stopAnalysis = false;

const getMediaTime = () => new Promise(resolve => {
	const video = document.getElementById('video');
	if (!video) return;
	video.requestVideoFrameCallback((now, metadata) => {
		resolve(metadata.mediaTime);
	});
});

const jumpNextFrame = async () => {
	const video = document.getElementById('video');
	if (!video) return;
  
	// force rerender
	video.currentTime += 1;
	video.currentTime -= 1;
  
	// get current frame time
	const firstMediaTime = await getMediaTime();
	var newtime = firstMediaTime;
  
	for (;;) {
	  // now adjust video's current time until actual frame time changes
	  video.currentTime += 0.01;
	  newtime = await getMediaTime();
	  if (newtime !== firstMediaTime) break;
	}
  
	return newtime;
  }

  const jumpPrevFrame = async () => {
	const video = document.getElementById('video');
	if (!video) return;
  
	// force rerender
	video.currentTime += 1;
	video.currentTime -= 1;
  
	// get current frame time
	const firstMediaTime = await getMediaTime();
	var newtime = firstMediaTime;
  
	for (;;) {
	  // now adjust video's current time until actual frame time changes
	  video.currentTime -= 0.01;
	  newtime = await getMediaTime();
	  if (newtime !== firstMediaTime) break;
	}
  
	return newtime;
  }

const getCurrentTime = async () => {
	const video = document.getElementById('video');
	if (!video) return;
  
	// force rerender
	video.currentTime += 1;
	video.currentTime -= 1;
  
	// get current frame time
	var currentTime = await getMediaTime();
	console.log(currentTime);
	return currentTime;
}

var videoTime = 0;

function newVideoFrame(now, metadata)
{
	videoTime = metadata.mediaTime;

	refreshTracking();

	processor.video.requestVideoFrameCallback(newVideoFrame);
}

let processor = {
	width: 320,
	height: 180,
	prevTime: -1,
	histogramComplete: false,
  
	doLoad: function() {
		this.video = document.getElementById("video");
		this.c1 = document.getElementById("c1");
		this.ctx1 = this.c1.getContext("2d");
		this.histogram = document.getElementById("histogram");
		this.histogram_ctx = this.histogram.getContext("2d");

		this.histogram_ctx.fillStyle = "rgba(0, 0, 0, " + 100/255 + ")";
		this.histogram_ctx.fillRect(0, 0, this.histogram.width, this.histogram.height);

		this.video.addEventListener("timeupdate", createHistogram, false);

		this.video.addEventListener("timeupdate", refreshTracking, false);

		this.video.requestVideoFrameCallback(newVideoFrame);

		jumpNextFrame();
	},
  
	computeHistogram: function() {
		let prevFrame = this.ctx1.getImageData(0, 0, this.width, this.height);

		this.ctx1.drawImage(this.video, 0, 0, this.video.videoWidth, this.video.videoHeight, 0, 0, this.width, this.height);
		
		let frame = this.ctx1.getImageData(0, 0, this.width, this.height);

		var x1 = Math.floor(this.histogram.width * this.prevTime/this.video.duration);
		var x2 = Math.floor(this.histogram.width * this.video.currentTime/this.video.duration);

		let histogram = this.histogram_ctx.getImageData(0, 0, this.histogram.width, this.histogram.height);

		for(var i=0; i<this.width; i++) {
			var r = 0;
			var g = 0;
			var b = 0;

			for(var j=0; j<this.height; j++) {
				var d = 4*(j*this.width+i);
				r += Math.abs(frame.data[d+0] - prevFrame.data[d+0]);
				g += Math.abs(frame.data[d+1] - prevFrame.data[d+1]);
				b += Math.abs(frame.data[d+2] - prevFrame.data[d+2]);
			}

			r *= 10/this.height;
			g *= 10/this.height;
			b *= 10/this.height;

			if(r > 255) r = 255;
			if(g > 255) g = 255;
			if(b > 255) b = 255;

			var h = Math.floor(this.histogram.height*i/this.width);
			for(var x=x1; x<=x2; x++) {
				var d = 4*(h*this.histogram.width+x);
				histogram.data[d+0] = r;
				histogram.data[d+1] = g;
				histogram.data[d+2] = b;
				histogram.data[d+3] = Math.max(100, r, g, b);
			}
		}

		this.histogram_ctx.putImageData(histogram, 0, 0);
		return;
	}
};

function createHistogram() {
	if(this.currentTime >= this.duration-1 || stopAnalysis) {
		this.removeEventListener("timeupdate", createHistogram, false);
		d3.select("#container").style("display", null);
		d3.select("#videoLoader").style("display", "none");
		return;
	}

	if(this.currentTime != processor.prevTime) {
		d3.select("#videoLoader div").html("Analyzing...<br/>" + Math.round(100*this.currentTime/this.duration) + '%');
		processor.computeHistogram();
	}

	processor.prevTime = this.currentTime;
	this.currentTime += this.duration/500;
}

var playSelectedFile = function(event) {
	var file = this.files[0];
	var type = file.type;
	var videoNode = document.querySelector('video');
	var canPlay = videoNode.canPlayType(type);
	console.log("can play video:", canPlay);

	if (canPlay == 'no') {
	  return
	}

	var fileURL = URL.createObjectURL(file);
	videoNode.src = fileURL;

	videoNode.addEventListener("loadeddata", function() {
		refreshCalibration();
		refreshKeyframes();
		refreshTracking();
	});

	var ob = localStorage.getItem(file.name);
	try {
		ob = JSON.parse(ob);
		keyframes = ob.keyframes;
		track = ob.track;
		calibration = ob.calibration;
	} catch(e) {}

	processor.doLoad();

	const container = document.getElementById('container');
	container.requestFullscreen();

	var histogramMouseMove = function() {
		if(d3.event.buttons == 1 || d3.event.touches) {
			seek(processor.video.duration * d3.mouse(this)[0]/this.clientWidth);
		}
	}

	var histogramMouseDown = function() {
		seek(processor.video.duration * d3.mouse(this)[0]/this.clientWidth);
	}

	d3.select("#loadVideo").style("display", "none");
	d3.select("#videoLoader").style("display", null);
	d3.select("#histogram").on("mousemove", histogramMouseMove).on("mousedown", histogramMouseDown)
						.on("touchmove", histogramMouseMove).on("touchstart", histogramMouseDown);

	videoNode.addEventListener("timeupdate", function() {
		d3.select("#currentTime").attr({
			x1: 1000*processor.video.currentTime/processor.video.duration,
			x2: 1000*processor.video.currentTime/processor.video.duration
		});
	}, false);

	var videoMouseDown = function() {
		processor.mouseStart = d3.mouse(this)[0]/this.clientWidth;
		processor.mouseStartTime = processor.video.currentTime;
	}

	var videoMouseUp = function() {
		processor.mouseStart = undefined;
	}

	var videoMouseMove = function() {
		if((d3.event.buttons == 1 || d3.event.touches) && processor.mouseStart !== undefined) {
			seek(processor.mouseStartTime + (d3.mouse(this)[0]/this.clientWidth - processor.mouseStart));
		}
	}

	d3.select("video").on("mousedown", videoMouseDown).on("mouseup", videoMouseUp).on("mousemove", videoMouseMove)
					.on("touchstart", videoMouseDown).on("touchend", videoMouseUp).on("touchmove", videoMouseMove);

	function screenToSVG(screenX, screenY) {
		var svg = d3.select("#calibration")[0][0];

		var p = svg.createSVGPoint()
		p.x = screenX;
		p.y = screenY;
		return p.matrixTransform(svg.getScreenCTM().inverse());
	}

	function screenToTrackSVG(screenX, screenY) {
		var svg = d3.select("#tracking")[0][0];

		var p = svg.createSVGPoint()
		p.x = screenX;
		p.y = screenY;
		return p.matrixTransform(svg.getScreenCTM().inverse());
	}
	
	var calibration1MouseDown = function() {
		calibration.editPoint = 1;
		calibration.moveSlow = false;
		var mouse = d3.mouse(document.body);
		calibration.mouseStart = screenToSVG(mouse[0], mouse[1]);
		calibration.pointStart = {x: calibration.x1, y: calibration.y1};
		refreshCalibration();
		d3.event.stopPropagation();
	}

	var calibration2MouseDown = function() {
		calibration.editPoint = 2;
		calibration.moveSlow = false;
		var mouse = d3.mouse(document.body);
		calibration.mouseStart = screenToSVG(mouse[0], mouse[1]);
		calibration.pointStart = {x: calibration.x2, y: calibration.y2};
		refreshCalibration();
		d3.event.stopPropagation();
	}

	var calibrationMouseDown = function() {
		calibration.moveSlow = true;
		if(calibration.editPoint > 0) {
			var mouse = d3.mouse(document.body);
			calibration.mouseStart = screenToSVG(mouse[0], mouse[1]);
			if(calibration.editPoint == 1)
				calibration.pointStart = {x: calibration.x1, y: calibration.y1};
			else
				calibration.pointStart = {x: calibration.x2, y: calibration.y2};
		}
	}

	var calibrationMouseMove = function() {
		var mul = calibration.moveSlow ? 0.1 : 1;
		if(calibration.editPoint == 1 && calibration.mouseStart) {
			var mouse = d3.mouse(document.body);
			mouse = screenToSVG(mouse[0], mouse[1]);
			calibration.x1 = calibration.pointStart.x + mul*(mouse.x - calibration.mouseStart.x);
			calibration.y1 = calibration.pointStart.y + mul*(mouse.y - calibration.mouseStart.y);
		}

		if(calibration.editPoint == 2 && calibration.mouseStart) {
			var mouse = d3.mouse(document.body);
			mouse = screenToSVG(mouse[0], mouse[1]);
			calibration.x2 = calibration.pointStart.x + mul*(mouse.x - calibration.mouseStart.x);
			calibration.y2 = calibration.pointStart.y + mul*(mouse.y - calibration.mouseStart.y);
		}

		refreshCalibration();
	}

	var calibrationMouseUp = function() {
		calibration.mouseStart = undefined;
		storeChanges();
	}


	d3.select("#calibration_point1").on("mousedown", calibration1MouseDown).on("touchstart", calibration1MouseDown);

	d3.select("#calibration_point2").on("mousedown", calibration2MouseDown).on("touchstart", calibration2MouseDown);
	
	d3.select("#calibration").on("mousedown", calibrationMouseDown).on("mouseup", calibrationMouseUp).on("mousemove", calibrationMouseMove)
								.on("touchstart", calibrationMouseDown).on("touchend", calibrationMouseUp).on("touchmove", calibrationMouseMove);


	var trackingPointMouseDown = function() {
		trackingMoveMul = 1;
	}

	var trackingMouseDown = function() {
		currentTrackPoint = undefined;

		var mouse = d3.mouse(document.body);
		trackingMouseStart = screenToTrackSVG(mouse[0], mouse[1]);

		if(trackingMouseStart) {
			currentTrackPoint = track.find(function(d){return d.t == videoTime;});
			
			if(currentTrackPoint == undefined) {
				var point = undefined;
				var dt = 0.1;
				track.forEach(function(d) {
					var t = Math.abs(d.t - videoTime);
					if(t < dt) {
						dt = t;
						point = d;
					}
				});

				currentTrackPoint = {
					t: videoTime,
					x: point ? point.x : trackingMouseStart.x,
					y: point ? point.y : trackingMouseStart.y
				};
				track.push(currentTrackPoint);
				track.sort(function(a, b) {return a.t - b.t;});
			}

			trackingPointStart = {x: currentTrackPoint.x, y: currentTrackPoint.y};

			refreshTracking();
		}
	}

	var trackingMouseUp = function() {
		trackingMouseStart = undefined;
		trackingMoveMul = 0.1;
		storeChanges();
	}

	var trackingMouseMove = function() {
		if(currentTrackPoint && trackingMouseStart) {
			var mouse = d3.mouse(document.body);
			mouse = screenToTrackSVG(mouse[0], mouse[1]);
			currentTrackPoint.x = trackingPointStart.x + trackingMoveMul*(mouse.x - trackingMouseStart.x);
			currentTrackPoint.y = trackingPointStart.y + trackingMoveMul*(mouse.y - trackingMouseStart.y);
			refreshTracking();
		}
	}

	d3.select("#tracking_point").on("mousedown", trackingPointMouseDown).on("touchstart", trackingPointMouseDown);

	d3.select("#tracking").on("mousedown", trackingMouseDown).on("mouseup", trackingMouseUp).on("mousemove", trackingMouseMove)
								.on("touchstart", trackingMouseDown).on("touchend", trackingMouseUp).on("touchmove", trackingMouseMove);
}

var seekTime = -1;
function seek(time) {
	seekTime = time;
}

var seekedTime = -1;
setInterval(function() {
	if(seekTime == seekedTime || processor.video.seeking)
		return;

	processor.video.currentTime = seekTime;
	seekedTime = seekTime;
}, 10);

document.addEventListener("keypress", (event) => {
	//console.log(event.code);
	if(event.code == "Period") {
		jumpNextFrame();
	}
	else if(event.code == "Comma") {
		jumpPrevFrame();
	}
});

document.addEventListener("DOMContentLoaded", () => {

  var inputNode = document.querySelector('input');
  inputNode.addEventListener('change', playSelectedFile, false)

  calibration = JSON.parse(JSON.stringify(default_calibration));
  refreshCalibration();
});

function skipAnalysis()
{
	stopAnalysis = true;
}


function refreshKeyframes()
{
	var kfs = d3.select("#timeline").selectAll(".keyframe").data(keyframes);
	kfs.enter().append("line").attr({
		class: "keyframe",
		y1: 0,
		y2: 25
	});
	kfs.attr({
		x1: function(d){return 1000*d/processor.video.duration;},
		x2: function(d){return 1000*d/processor.video.duration;},
	});
	kfs.exit().remove();
}

var keyframes = [];
function addKeyframe()
{
	keyframes.push(processor.video.currentTime);
	keyframes.sort(function(a, b){return a-b;});
	storeChanges();
	refreshKeyframes();
}

function removeKeyframe()
{
	var kf = keyframes.find(function(d){return Math.abs(d-processor.video.currentTime) < 0.1; });
	if(kf) {
		keyframes.splice(keyframes.indexOf(kf), 1);
		storeChanges();
		refreshKeyframes();
	}
}

function jumpToNextKeyframe()
{
	var kf = keyframes.find(function(d){return d > processor.video.currentTime+0.1;});
	if(kf)
		processor.video.currentTime = kf;
}

function jumpToPrevKeyframe()
{
	var kf = undefined;
	for(var i=0; i<keyframes.length; i++) {
		if(keyframes[i] < processor.video.currentTime-0.1)
			kf = keyframes[i];
		else
			break;
	}

	if(kf)
		processor.video.currentTime = kf;
}

function clearAllKeyframes()
{
	showPopup("Clear all keyframes?", function() {
		keyframes = [];
		storeChanges();
		refreshKeyframes();
	});
}

function showPopup(text, yes_func)
{
	d3.select("#popup_text").text(text);
	d3.select("#popup").style("display", null);

	d3.select("#popup_yes").on("click", function() {
		yes_func();
		d3.select("#popup").style("display", "none");
	});
	d3.select("#popup_no").on("click", function() {
		d3.select("#popup").style("display", "none");
	});
}

function resetCalibration()
{
	showPopup("Reset the calibration?", function() {
		calibration = JSON.parse(JSON.stringify(default_calibration));
		storeChanges();
		refreshCalibration();
	});
}

function refreshCalibration()
{
	var dx = calibration.x1-calibration.x2;
	var dy = calibration.y1-calibration.y2;
	calibration.radius = Math.sqrt(dx*dx+dy*dy)/2;

	d3.select("#calibration_point1").attr({
		cx: calibration.x1,
		cy: calibration.y1,
	}).classed("selected", calibration.editPoint == 1);

	d3.select("#calibration_point2").attr({
		cx: calibration.x2,
		cy: calibration.y2
	}).classed("selected", calibration.editPoint == 2);

	d3.select("#calibration_line").attr({
		x1: calibration.x1,
		y1: calibration.y1,
		x2: calibration.x2,
		y2: calibration.y2,
	});

	d3.select("#menu_calibration input")[0][0].value = calibration.width || "";

	if(processor.video) {
		var mag = document.getElementById("magnifier");
		var ctx = mag.getContext("2d");

		if(calibration.editPoint == 1)
			ctx.drawImage(processor.video, calibration.x1-50, calibration.y1-50, 100, 100, 0, 0, 200, 200);
		else
			ctx.drawImage(processor.video, calibration.x2-50, calibration.y2-50, 100, 100, 0, 0, 200, 200);

		ctx.fillStyle = "red";
		ctx.fillRect(99, 80, 2, 40);
		ctx.fillRect(80, 99, 40, 2);
	}
}

function setCalibrationWidth()
{
	calibration.width = parseFloat(d3.select("#menu_calibration input")[0][0].value);
	if(isNaN(calibration.width) || calibration.width < 0.001)
		calibration.width = undefined;

	storeChanges();
}

function menuKeyframes()
{
	d3.select("#menuButtonKeyframes").html("[Keyframes]");
	d3.select("#menuButtonCalibration").html("&nbsp;Calibration&nbsp;");
	d3.select("#menuButtonTracking").html("&nbsp;Tracking&nbsp;");
	d3.select("#menu_keyframes").style("display", null);
	d3.select("#menu_calibration").style("display", "none");
	d3.select("#menu_tracking").style("display", "none");
	d3.select("#tracking").style("display", "none");
	d3.select("#calibration").style("display", "none");
	d3.select("#magnifier").style("display", "none");
}

function menuCalibration()
{
	d3.select("#menuButtonKeyframes").html("&nbsp;Keyframes&nbsp;");
	d3.select("#menuButtonCalibration").html("[Calibration]");
	d3.select("#menuButtonTracking").html("&nbsp;Tracking&nbsp;");
	d3.select("#menu_keyframes").style("display", "none");
	d3.select("#menu_calibration").style("display", null);
	d3.select("#menu_tracking").style("display", "none");
	d3.select("#tracking").style("display", "none");
	d3.select("#calibration").style("display", null);
	d3.select("#magnifier").style("display", null);	
}

function menuTracking()
{
	d3.select("#menuButtonKeyframes").html("&nbsp;Keyframes&nbsp;");
	d3.select("#menuButtonCalibration").html("&nbsp;Calibration&nbsp;");
	d3.select("#menuButtonTracking").html("[Tracking]");
	d3.select("#menu_keyframes").style("display", "none");
	d3.select("#menu_calibration").style("display", "none");
	d3.select("#menu_tracking").style("display", null);
	d3.select("#tracking").style("display", null);
	d3.select("#calibration").style("display", "none");
	d3.select("#magnifier").style("display", "none");
}

function clearTracks()
{

}

function removeTrack()
{

}

function trackPrev()
{
	jumpPrevFrame();
}

function trackNext()
{
	jumpNextFrame();
}

var tracking_path = d3.svg.line().interpolate("monotone").x(function(d){return d.x;}).y(function(d){return d.y;});

function refreshTracking()
{
	var point = track.find(function(d){return d.t == videoTime;});

	var opacity = 1;

	if(!point) {
		opacity = 0.3;

		var dt = 0.1;
		track.forEach(function(d) {
			var t = Math.abs(d.t - videoTime);
			if(t < dt) {
				dt = t;
				point = d;
			}
		});
	}
	
	if(point) {
		d3.select("#tracking_point").attr({
			cx: point.x,
			cy: point.y,
			r: calibration.radius
		}).style({
			visibility: null,
			opacity: opacity
		});
		d3.select("#tracking_dot").attr({
			cx: point.x,
			cy: point.y,
			r: 5
		}).style({
			visibility: null,
			opacity: opacity
		});

		var i = track.indexOf(point);
		if(i>0) {
			var dx = point.x - track[i-1].x;
			var dy = point.y - track[i-1].y;
			var dt = point.t - track[i-1].t;

			if(dt < 0.1) {
				var v = Math.sqrt(dx*dx+dy*dy)/(2*calibration.radius)*(calibration.width*0.01)/dt;

				var a = -(Math.atan2(dx, dy)*180/Math.PI + 90);
				//if(a < -90)
				//	a = 180+a;
				//else if(a > 90)
				//	a = 180-a;

				d3.select("#velocity").style("visibility", null).attr({
					x: (point.x + track[i-1].x)/2,
					y: (point.y + track[i-1].y)/2 - 30
				}).html(v.toFixed(1) + " m/s " + Math.round(a) + "&deg;");
			}
			else {
				d3.select("#velocity").style("visibility", "hidden");	
			}
		}
		else {
			d3.select("#velocity").style("visibility", "hidden");
		}
	}
	else {
		d3.select("#tracking_point").style("visibility", "hidden");
		d3.select("#tracking_dot").style("visibility", "hidden");

		d3.select("#velocity").style("visibility", "hidden");
	}

	var visiblePoints = track.filter(function(d){return Math.abs(d.t - videoTime) < 1.5;});
	d3.select("#tracking_path").attr("d", tracking_path(visiblePoints));
}

function storeChanges() {
	localStorage.setItem(document.querySelector("input").files[0].name, JSON.stringify({calibration: calibration, keyframes: keyframes, track: track}));
}