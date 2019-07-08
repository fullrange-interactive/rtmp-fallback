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

        // this.ffmpegLogStream = fs.createWriteStream(`${Config.logBasePath}/ffmpegfallbacklog`);

        this.ffmpegProcess = ChildProcess.spawn('ffmpeg', (`-re -stream_loop -1 -i ${this.filePath} -ar 44100 -c copy -f mpegts -`).split(" "));
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

    errorCode = errorCode === null ? 0 : errorCode;

    if(typeof(this.config.onExit) !== 'undefined')
      this.config.onExit(`ffmpeg fallback exit with error code ${errorCode}. More information in log ${Config.logBasePath}/ffmpegfallbacklog`);

  }

  pipeTo(outputStream, listenToRestart = true){

    this._outputStream = outputStream;

    if (listenToRestart){
      this._outputStream.on('restart', this.onOutputStreamRestart.bind(this));
    }

  }

  play(){

    if(!this.enabled){

      Log.say("Now playing fallback video...");

      this.startOutputPipe();
      this.enabled = true;

    }


  }

  pause(){

    if(this.enabled){

      Log.say("Fallback video stopped...");

      this.stopOutputPipe();
      this.enabled = false;

    }

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

    Log.say("Outputstream restarted...");
    this.pipeTo(outputStream, false);
    this.stopOutputPipe();
    this.startOutputPipe();

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

    Log.say("Fallback stopped");    

  }

}

export default FallbackVideoPlayer;