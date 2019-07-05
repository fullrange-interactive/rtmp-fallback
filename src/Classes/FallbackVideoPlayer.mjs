import * as ChildProcess from 'child_process';
import fs from 'fs';

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

        this.ffmpegLogStream = fs.createWriteStream(`${Config.logBasePath}/ffmpegfallbacklog`);

        this.ffmpegProcess = ChildProcess.spawn('ffmpeg', (`-re -stream_loop -1 -i ${this.filePath} -ar 44100 -c copy -f mpegts -`).split(" "));
        this.ffmpegProcess.stdout.on("data", this.onData.bind(this));
        this.ffmpegProcess.on("exit", this.onFfmpegExit.bind(this));
        this.ffmpegProcess.stderr.on("data", (msg) => { if(this.ffmpegLogStream !== null) this.ffmpegLogStream.write(msg) });

        this.ffmpegProcess.stdin.on('error', (e) => {
          console.log('something is erroring in the fallbackvideo ffmpeg stdin stream', e);
        })

        this.ffmpegProcess.stdout.on('error', (e) => {
          console.log('something is erroring in the fallbackvideo ffmpeg stdout stream', e);
        })

        Log.say("Fallback init");

        resolve();

      }
      catch(e){

        reject(e);

      }

    })

  }

  onFfmpegExit(errorCode){

    if(typeof(this.config.onExit) !== 'undefined')
      this.config.onExit(`ffmpeg fallback exit with error code ${errorCode}. More information in log ${Config.logBasePath}/ffmpegfallbacklog`);

  }

  pipeTo(outputStream){

    this._outputStream = outputStream;

  }

  play(){

    Log.say("Now playing fallback video...");

    this._pipe();
    this.enabled = true;


  }

  pause(){

    Log.say("Fallback video stopped...");

    this._unpipe();
    this.enabled = false;

  }

  _pipe() {

    if (!this._piped && this._outputStream !== null) {

      this._outputStream.pipeFrom(this.ffmpegProcess.stdout);
      this._piped = true;

    }

  }

  _unpipe() {

    if (this._piped && this._outputStream !== null) {

      this._outputStream.unpipeFrom(this.ffmpegProcess.stdout);
      this._piped = false;

    }

  }

  stop(){

    if(this.ffmpegProcess === null)
      return;

    this.ffmpegProcess.stdout.unref();
    this.ffmpegProcess.stderr.unref();
    this.ffmpegProcess.kill('SIGKILL');
    this.ffmpegProcess = null;

    this.ffmpegLogStream.end()
    this.ffmpegLogStream = null;    

    Log.say("Fallback stopped");    

  }

  onData(frame){

    // if(typeof(this.config.onData) !== 'undefined' && this.enabled){
    //   this.config.onData(frame);
    // }

  }

}

export default FallbackVideoPlayer;