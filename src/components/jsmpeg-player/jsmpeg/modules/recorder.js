import { download } from '../utils'

/*
 * @Author: lcm
 * @Date: 2022-12-14 16:23:11
 * @LastEditors: lcm
 * @LastEditTime: 2022-12-14 19:33:39
 * @Description:
 */
export default class Recorder {
  /**
   * 录制持续时间(毫秒)
   */
  duration = 0
  /**
   * 计时器
   */
  timer = null
  /**
   * 录制模式
   * @type {'auto'|'canvas'|'ws'}
   */
  mode = 'auto'
  /**
   * 是否运行中
   */
  running = false
  paused = false
  /**
   * 媒体录制器
   * @type {MediaRecorder}
   */
  mediaRecorder = null
  /**
   * 视频流(仅mode='canvas'时有效)
   * @type {MediaStream}
   */
  mediaStream = null
  /**
   * 视频数据块
   * @type {ArrayBuffer[]}
   */
  chunks = null
  /**
   * 播放器的source
   * @type {import('./source/websocket').default}
   */
  source = null
  /**
   * 播放器的canvas
   * @type {HTMLCanvasElement}
   */
  canvas = null
  /**
   *
   * @param {object} param
   * @param {HTMLCanvasElement} param.canvas
   * @param {string} param.mode
   * @param {any} param.source
   */
  constructor({ canvas, mode = 'auto', source } = {}) {
    if (!/^auto|canvas|ws$/.test(mode)) {
      throw new Error('[Recorder] 不支持此录制模式: ' + mode)
    }
    // super()

    this.canvas = canvas
    this.source = source

    if (mode === 'auto') {
      this.mode = window.MediaRecorder ? 'canvas' : 'ws'
    } else {
      this.mode = mode
    }
  }

  /**
   * 开始录制
   */
  start() {
    if (this.running) {
      return
    }

    this.duration = 0
    this.chunks = []

    // 开始录制
    if (this.mode === 'canvas') {
      /**
       * 注意，此方法兼容性较差，captureStream、MediaRecorder好像都是新规范，有些浏览器不支持
       * 具体见：https://developer.mozilla.org/zh-CN/docs/Web/API/MediaRecorder
       */
      this.mediaStream = this.canvas?.captureStream()
      this.mediaRecorder = new MediaRecorder(this.mediaStream, {
        mimeType: this.mimeType
      })
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          this.chunks.push(e.data)
        }
      }
      // 这里尽量传一个切片时间，不然ondataavailable只会在stop时触发，而且会产生一个超大的blob
      this.mediaRecorder.start(1000)

      this.mimeType = 'video/webm;codecs=vp9'
    } else if (this.mode === 'ws') {
      // 服务端转发过来的流就是ffmpeg已转码的ts视频流数据，所以在websocket收到数据的时候，存放到数组中即可实现录制
      this.chunks.write = function (data) {
        this.push(data)
      }
      this.source.recorder = this.chunks

      this.mimeType = 'video/MP2T'
    } else {
      return null
    }

    // 计时器
    this.paused = false

    this.startTime = Date.now()
    this.timer = setInterval(() => {
      if (this.paused) return

      // 对比Date.now()差值的方式比单纯++更加精准
      this.duration = Date.now() - this.startTime
    }, 500)

    this.running = true
  }
  /**
   * 暂停录制
   * PS：暂停后running还是为true
   */
  pause() {
    this.paused = true
    if (this.mediaRecorder) {
      this.mediaRecorder.pause()
    }
    if (this.source) {
      this.source.recorder = null
    }

    // this.running = false
  }
  /**
   * 继续录制
   */
  continue() {
    this.paused = false
    if (this.mediaRecorder) {
      this.mediaRecorder.resume()
    }
    if (this.source) {
      this.source.recorder = this.chunks
    }

    // this.running = true
  }
  /**
   * 停止录制
   * @param {string} saveName 保存文件名称，不传则不保存，需要手动保存
   */
  stop(saveName = null) {
    this.pause()
    if (this.mediaRecorder) {
      this.mediaRecorder.stop()
    }

    saveName && this.save(saveName)
  }
  /**
   * 保存
   * @returns
   */
  save(name = 'jsmpeg') {
    if (!this.running || !this.chunks) return

    let outputName = `${name}_录制_${new Date().toLocaleTimeString()}`

    let extension
    if (this.mode === 'canvas' && this.mediaRecorder && this.mediaStream) {
      extension = 'webm'
    } else if (this.mode === 'ws' && this.chunks instanceof Array) {
      extension = 'ts'
    }

    download(this.chunks, `${outputName}.${extension}`, this.mimeType)
  }
  /**
   * 销毁录制器
   */
  destroy() {
    this.stop()

    this.mediaRecorder = null
    this.mediaStream = null

    this.chunks = null
    this.duration = 0
  }
}
