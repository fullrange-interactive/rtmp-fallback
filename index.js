#!/usr/bin/env node
const argv = require("minimist")(process.argv.slice(2));
const spawn = require("child_process").spawn;
const fs = require("fs");
const getDuration = require("get-video-duration");

function initInputStream(){

	if(noDataTimeout)
		clearTimeout(noDataTimeout);

	let toReturn = spawn("ffmpeg", ("-f live_flv -i - -c copy -f mpegts -").split(" "));
	toReturn.on("exit", (code) => { console.log("ffmpegIn exited with code " + code); ffmpegIn = initInputStream() });
	toReturn.stdout.on("data", onData);

	return toReturn;

}

if(argv._.length < 3) {
	console.log("Usage: rtmp-fallback rtmpInput fallbackFile rtmpOutput");
	console.log("fallbackFile MUST be a .ts file");
	console.log("Options:");
	console.log("	-l: Enable logging in /tmp of rtmpdump/ffmpeg outputs.");
	console.log("	-t ms: Timeout in milliseconds before switching to fallback file. Defaults to 5000ms.");
	console.log("	-d ms: Set fallback video's duration in ms. Will fallback to automatic detection if not set.");
	process.exit(1);
}

const timeoutLength = (argv.t) ? argv.t : 2000;
const loggingEnabled = (argv.l != null);

const noDataBuf = require("fs").readFileSync(process.argv[3]);
let noDataDur = argv.d;
if(!noDataDur)
	getDuration(process.argv[3])
		.then((duration) => noDataDur = duration*1000)
		.catch((e) => { 
			console.error("An error occured while probing duration for fallback file!", e);
			process.exit(1);
		});
let noDataTimeout = null;
let lastNoData = null;

const ffmpegOut = spawn("ffmpeg", ("-fflags +genpts -re -f mpegts -i - -c copy -acodec libmp3lame -ar 44100 -f flv "+process.argv[4]).split(" "));
ffmpegOut.on("exit", (code) => { console.log("ffmpegOut exited with code "+code+"! Exiting..."); process.exit(code); });

ffmpegIn = initInputStream();

const currentStream = spawn("rtmpdump", ("-m 0 -v -r "+process.argv[2]).split(" "));
currentStream.on("exit", (code) => { console.log("rtmpdump exited with code "+code+"+! Exiting..."); process.exit(code); });
currentStream.stdout.on("data", (videoData) => { console.log("GetData from rtmpdump"); ffmpegIn.stdin.write(videoData) });

if(loggingEnabled) {
	const ffmpegOutLog = fs.createWriteStream("/tmp/ffmpegoutlog");
	ffmpegOut.stderr.on("data", (msg) => ffmpegOutLog.write(msg));
	const ffmpegInLog = fs.createWriteStream("/tmp/ffmpeginlog");
	ffmpegIn.stderr.on("data", (msg) => ffmpegInLog.write(msg));
	const rtmpdumpLog = fs.createWriteStream("/tmp/rtmpdumplog");
	currentStream.stderr.on("data", (msg) => rtmpdumpLog.write(msg));
}

function onData(videoData) {



	ffmpegOut.stdin.write(videoData);
	if(noDataTimeout)
		clearTimeout(noDataTimeout);
	noDataTimeout = setTimeout(noData, timeoutLength);	
	
}

function noData() {

	console.log("Timeout reached! Switching to fallback file...");
	ffmpegOut.stdin.write(noDataBuf);
	setNoDateTimeout();

}

function setNoDateTimeout() {
	// Instead of using setInterval, we're using setTimeout with re-calculated delay everytime, otherwise the delay will increase over time
	// because of the time it takes to write to the console and pass data to ffmpeg

	noDataTimeout = setTimeout(() => {
		ffmpegOut.stdin.write(noDataBuf);
		lastNoData = Date.now();
		setNoDateTimeout();
	}, (lastNoData == null) ? noDataDur : (Date.now() - lastNoData + noDataDur));
}

//noDataTimeout = setTimeout(noData, timeoutLength);

console.log("RTMP Fallback successfully initialized");
