import * as ChildProcess from 'child_process';
import fs from 'fs';
import moment from 'moment';

import Log from './Log';

import Config from '../Config';

class FallbackVideoPlayer{

  constructor(filePath, config){

    this.filePath = filePath;
    this.config = config;

    this.enabled = false;

    this.ffmpegProcess = null;
    this.ffmpegLogStream = null;

    this._piped = false;
    this._outputStream = null;

  }

  init(){

    return new Promise((resolve, reject) => {

      try{

        this.ffmpegLogStream = fs.createWriteStream(`${Config.logBasePath}/ffmpegfallbacklog_${moment().format("DD.MM.YYYY_HH:mm:ss")}`);

        this.ffmpegProcess = ChildProcess.spawn('ffmpeg', (`-loglevel warning -re -stream_loop -1 -i ${this.filePath} -ar 44100 -c copy -f mpegts -`).split(" "));
        this.ffmpegProcess.stdout.on("data", this.onData.bind(this));
        this.ffmpegProcess.on("exit", this.onFfmpegExit.bind(this));
        this.ffmpegProcess.stderr.on("data", (msg) => { if(this.ffmpegLogStream !== null) this.ffmpegLogStream.write(msg) });

        this.ffmpegProcess.stdin.on('error', (e) => {
          console.log('something is erroring in the fallbackvideo ffmpeg stdin stream', e);
        })

        this.ffmpegProcess.stdout.on('error', (e) => {
          console.log('something is erroring in the fallbackvideo ffmpeg stdout stream', e);
        })

        Log.say("[FallbackVideoPlayer] init");

        resolve();

      }
      catch(e){

        reject(e);

      }

    })

  }

  onFfmpegExit(errorCode){

    errorCode = errorCode === null ? 0 : errorCode;
    
    if(typeof(this.config.onExit) !== 'undefined')
      this.config.onExit(`ffmpeg fallback exit with error code ${errorCode}. More information in log ${Config.logBasePath}/ffmpegfallbacklog`);

    Log.error('warning', 'FallbackVideoPlayer', '[FallbackVideoPlayer] FallbackVideoPlayer Stream FFMpeg exited with code ' + errorCode);
    
    if(typeof(this.config.onExit) !== 'undefined')
      this.config.onExit(`ffmpeg input stream exited with error code ${errorCode}. More information in log ${Config.logBasePath}/ffmpeginlog_date`, errorCode);

    this.restart(() => {
      this.pipeTo(this._outputStream, false);
    });

  }

  pipeTo(outputStream, listenToRestart = true){

    this._outputStream = outputStream;

    if (listenToRestart){
      this._outputStream.on('restart', this.onOutputStreamRestart.bind(this));
    }

  }

  play(){

    Log.say("[FallbackVideoPlayer] Now playing fallback video...");

    this.startOutputPipe();
    this.enabled = true;


  }

  pause(){

    Log.say("[FallbackVideoPlayer] Fallback video stopped...");

    this.stopOutputPipe();
    this.enabled = false;

  }

  startOutputPipe() {

    if (!this._piped && this._outputStream !== null) {

      this._outputStream.pipeFrom(this.ffmpegProcess.stdout);
      this._piped = true;

    }

  }

  stopOutputPipe() {

    if (this._piped && this._outputStream !== null) {

      this._outputStream.unpipeFrom(this.ffmpegProcess.stdout);
      this._piped = false;

    }

  }

  onOutputStreamRestart(outputStream){

    Log.say("[FallbackVideoPlayer] output stream restarted. Restarting FallbackVideoPlayer");
    this.pipeTo(outputStream, false);
    this.stopOutputPipe();
    this.startOutputPipe();

  }


  restart(callback){

    Log.say("[InputStream] restart called.");

    if (this._restarting) {
      Log.say("[InputStream] aborting restart ... a restart is already in process");
      return;
    }

    this._restarting = true;

    this.stop();

    setTimeout(() => {

      this.init()
        .then(() => {

          if (typeof callback !== 'undefined') {
            callback();
          }
          this._restarting = false;

        })
        .catch((e) => {

          throw e;

        })

    }, 2000);    

  }

  stop(){

    if(this.ffmpegProcess === null)
      return;

    this.ffmpegProcess.stdout.unref();
    this.ffmpegProcess.stderr.unref();
    this.ffmpegProcess.kill('SIGKILL');
    this.ffmpegProcess = null;

    if (this.ffmpegLogStream !== null){
      this.ffmpegLogStream.end()
    }
    this.ffmpegLogStream = null;    

    Log.say("[FallbackVideoPlayer] stopped");    

  }

  onData(frame){

    // if(typeof(this.config.onData) !== 'undefined' && this.enabled){
    //   this.config.onData(frame);
    // }

  }

}

export default FallbackVideoPlayer;