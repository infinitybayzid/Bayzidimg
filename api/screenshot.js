const ffmpegPath = require("@ffmpeg-installer/ffmpeg").path;
const ffmpeg = require("fluent-ffmpeg");
const { createCanvas, loadImage } = require("canvas");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

ffmpeg.setFfmpegPath(ffmpegPath);

module.exports = async (req, res) => {
  try {
    const videoUrl = req.query.url;
    if (!videoUrl) return res.status(400).send("Video URL missing");

    const videoPath = path.join("/tmp", `input-${Date.now()}.mp4`);
    const response = await axios({ url: videoUrl, responseType: "stream" });
    const writer = fs.createWriteStream(videoPath);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on("finish", resolve);
      writer.on("error", reject);
    });

    const { width, height } = await getVideoSize(videoPath);
    const canvasPerRow = 2;
    const totalScreens = 14;
    const padding = 5;
    const rowCount = Math.ceil(totalScreens / canvasPerRow);
    const canvasWidth = width * canvasPerRow + padding * (canvasPerRow + 1);
    const canvasHeight = height * rowCount + padding * (rowCount + 1);
    const canvas = createCanvas(canvasWidth, canvasHeight);
    const ctx = canvas.getContext("2d");

    const duration = await getVideoDuration(videoPath);
    const interval = (duration - 600) / (totalScreens + 1);
    let timestamps = [];

    for (let i = 1; i <= totalScreens; i++) {
      timestamps.push(300 + i * interval);
    }

    const imgPaths = [];

    for (let i = 0; i < timestamps.length; i++) {
      const imgPath = path.join("/tmp", `shot-${i}-${Date.now()}.png`);
      await new Promise((resolve, reject) => {
        ffmpeg(videoPath)
          .screenshots({
            timestamps: [timestamps[i]],
            filename: path.basename(imgPath),
            folder: path.dirname(imgPath),
            size: `${width}x${height}`,
          })
          .on("end", resolve)
          .on("error", reject);
      });
      imgPaths.push(imgPath);
    }

    for (let i = 0; i < imgPaths.length; i++) {
      const img = await loadImage(imgPaths[i]);
      const x = (i % canvasPerRow) * (width + padding) + padding;
      const y = Math.floor(i / canvasPerRow) * (height + padding) + padding;
      ctx.drawImage(img, x, y, width, height);
    }

    const finalBuffer = canvas.toBuffer("image/png");

    res.setHeader("Content-Type", "image/png");
    res.send(finalBuffer);

    fs.unlinkSync(videoPath);
    imgPaths.forEach((p) => fs.unlinkSync(p));
  } catch (err) {
    console.error(err);
    res.status(500).send("Something went wrong!");
  }
};

function getVideoDuration(path) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(path, (err, metadata) => {
      if (err) return reject(err);
      resolve(metadata.format.duration);
    });
  });
}

function getVideoSize(path) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(path, (err, metadata) => {
      if (err) return reject(err);
      const { width, height } = metadata.streams.find((s) => s.width);
      resolve({ width, height });
    });
  });
}
