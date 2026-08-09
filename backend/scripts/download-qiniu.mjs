#!/usr/bin/env node

import {
  GetObjectCommand,
  ListBucketsCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { createWriteStream } from 'node:fs';
import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { pipeline } from 'node:stream/promises';
import qiniu from 'qiniu';

const QINIU_KODO_BUCKET = 'autoupload';
const DEFAULT_PREFIX = 'moto_assistant/';
const LIST_LIMIT = 1000;

const HELP = `下载七牛存储桶中的对象

用法:
  auth='<accessKey>|<secretKey>' pnpm qiniu:download -- [选项]

选项:
  --output <目录>       下载目录，默认 ./qiniu-download
  --prefix <前缀>       只下载指定 key 前缀
  --bucket <空间名>     指定 S3 空间名，默认自动识别
  --concurrency <数量>  并发下载数，默认 4，最大 32
  --overwrite           覆盖大小不一致的本地文件
  --help                显示帮助

示例:
  auth='<accessKey>|<secretKey>' pnpm qiniu:download -- \\
    --output ./qiniu-backup --prefix moto_assistant/
`;

function parsePositiveInteger(value, optionName, maximum) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new Error(`${optionName} 必须是 1 到 ${maximum} 之间的整数`);
  }
  return parsed;
}

function readOptionValue(args, index, optionName) {
  const value = args[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${optionName} 缺少参数`);
  }
  return value;
}

function parseOptions(args) {
  const options = {
    bucket: undefined,
    concurrency: 4,
    output: './qiniu-download',
    overwrite: false,
    prefix: '',
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    switch (argument) {
      case '--':
        break;
      case '--bucket':
        options.bucket = readOptionValue(args, index, argument);
        index += 1;
        break;
      case '--concurrency': {
        const value = readOptionValue(args, index, argument);
        options.concurrency = parsePositiveInteger(value, argument, 32);
        index += 1;
        break;
      }
      case '--help':
        options.help = true;
        break;
      case '--output':
        options.output = readOptionValue(args, index, argument);
        index += 1;
        break;
      case '--overwrite':
        options.overwrite = true;
        break;
      case '--prefix':
        options.prefix = readOptionValue(args, index, argument);
        index += 1;
        break;
      default:
        throw new Error(`未知参数 ${argument}`);
    }
  }

  return options;
}

function parseAuth(value) {
  if (!value) {
    throw new Error('缺少 auth 环境变量');
  }

  const parts = value.split('|');
  if (parts.length !== 2 || parts.some((part) => part.length === 0)) {
    throw new Error('auth 格式应为 accessKey|secretKey');
  }

  const [accessKeyId, secretAccessKey] = parts;
  return { accessKeyId, secretAccessKey };
}

async function discoverS3Endpoint(accessKey) {
  const config = new qiniu.conf.Config({ useHttpsDomain: true });
  const regionsProvider = await config.getRegionsProvider({
    accessKey,
    bucketName: QINIU_KODO_BUCKET,
  });
  const regions = await regionsProvider.getRegions();

  for (const region of regions) {
    const endpoints = region.services[qiniu.httpc.SERVICE_NAME.S3];
    if (region.s3RegionId && endpoints?.length) {
      return {
        endpoint: endpoints[0].getValue({ scheme: 'https' }),
        region: region.s3RegionId,
      };
    }
  }

  throw new Error(`无法获取七牛空间 ${QINIU_KODO_BUCKET} 的 S3 端点`);
}

async function listBucketNames(client) {
  const response = await client.send(new ListBucketsCommand({}));
  return (response.Buckets ?? [])
    .map((bucket) => bucket.Name)
    .filter((name) => typeof name === 'string' && name.length > 0);
}

async function containsObjects(client, bucket, prefix) {
  try {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        MaxKeys: 1,
        Prefix: prefix || undefined,
      }),
    );
    return (response.KeyCount ?? response.Contents?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

async function resolveS3Bucket(client, requestedBucket, prefix) {
  if (requestedBucket) {
    return requestedBucket;
  }

  const bucketNames = await listBucketNames(client);
  if (bucketNames.includes(QINIU_KODO_BUCKET)) {
    return QINIU_KODO_BUCKET;
  }

  const matchingNames = bucketNames.filter((name) =>
    name.startsWith(`${QINIU_KODO_BUCKET}-`),
  );
  if (matchingNames.length === 1) {
    return matchingNames[0];
  }
  if (bucketNames.length === 1) {
    return bucketNames[0];
  }

  const probePrefix = prefix || DEFAULT_PREFIX;
  const matches = [];
  for (const bucketName of matchingNames.length ? matchingNames : bucketNames) {
    if (await containsObjects(client, bucketName, probePrefix)) {
      matches.push(bucketName);
    }
  }
  if (matches.length === 1) {
    return matches[0];
  }

  throw new Error(
    `无法自动识别 ${QINIU_KODO_BUCKET} 对应的 S3 空间名，请通过 --bucket 指定`,
  );
}

async function listPage(client, bucket, prefix, continuationToken) {
  return client.send(
    new ListObjectsV2Command({
      Bucket: bucket,
      ContinuationToken: continuationToken || undefined,
      MaxKeys: LIST_LIMIT,
      Prefix: prefix || undefined,
    }),
  );
}

function resolveDestination(outputRoot, key) {
  const segments = key?.split('/') ?? [];
  if (
    segments.length === 0 ||
    segments.some(
      (segment) => !segment || segment === '.' || segment === '..',
    ) ||
    key.includes('\0') ||
    key.includes('\\')
  ) {
    throw new Error(`无法映射对象 key ${JSON.stringify(key)}`);
  }

  const destination = resolve(outputRoot, key);
  if (!destination.startsWith(`${outputRoot}${sep}`)) {
    throw new Error(`对象 key 超出下载目录 ${JSON.stringify(key)}`);
  }
  return destination;
}

async function getFileSize(path) {
  try {
    const file = await stat(path);
    if (!file.isFile()) {
      throw new Error(`本地目标不是文件 ${path}`);
    }
    return file.size;
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

async function downloadObject(client, bucket, options, outputRoot, item) {
  const key = item.Key;
  const expectedSize = item.Size;
  if (key?.endsWith('/') && expectedSize === 0) {
    return 'skipped';
  }
  if (!key || !Number.isSafeInteger(expectedSize) || expectedSize < 0) {
    throw new Error(`对象元数据无效 ${JSON.stringify(key)}`);
  }

  const destination = resolveDestination(outputRoot, key);
  const currentSize = await getFileSize(destination);
  if (currentSize === expectedSize) {
    return 'skipped';
  }
  if (currentSize !== undefined && !options.overwrite) {
    throw new Error(`本地文件已存在且大小不一致 ${destination}`);
  }

  await mkdir(dirname(destination), { recursive: true });
  const temporaryPath = `${destination}.qiniu-download.part`;

  try {
    const response = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    if (!response.Body) {
      throw new Error(`七牛返回了空响应 ${JSON.stringify(key)}`);
    }
    await pipeline(
      response.Body,
      createWriteStream(temporaryPath, { flags: 'w' }),
    );

    const downloadedSize = await getFileSize(temporaryPath);
    if (downloadedSize !== expectedSize) {
      throw new Error(
        `对象大小不一致 ${JSON.stringify(key)} expected=${expectedSize} actual=${downloadedSize}`,
      );
    }

    await rename(temporaryPath, destination);
    return 'downloaded';
  } catch (error) {
    await unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

async function downloadPage(
  client,
  bucket,
  options,
  outputRoot,
  items,
  summary,
) {
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      try {
        const result = await downloadObject(
          client,
          bucket,
          options,
          outputRoot,
          item,
        );
        summary[result] += 1;
        console.log(
          `${result === 'downloaded' ? '已下载' : '已跳过'} ${JSON.stringify(item.Key)}`,
        );
      } catch (error) {
        summary.failed += 1;
        const message = error instanceof Error ? error.message : String(error);
        console.error(`下载失败 ${JSON.stringify(item.Key)} ${message}`);
      }
    }
  }

  const workerCount = Math.min(options.concurrency, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

async function main() {
  const options = parseOptions(process.argv.slice(2));
  if (options.help) {
    console.log(HELP);
    return;
  }

  const credentials = parseAuth(process.env.auth);
  const { endpoint, region } = await discoverS3Endpoint(
    credentials.accessKeyId,
  );
  const client = new S3Client({
    credentials,
    endpoint,
    forcePathStyle: true,
    region,
  });

  try {
    const bucket = await resolveS3Bucket(
      client,
      options.bucket,
      options.prefix,
    );
    const outputRoot = resolve(options.output);
    await mkdir(outputRoot, { recursive: true });
    console.log(`开始下载 bucket=${bucket} endpoint=${endpoint}`);

    const summary = { downloaded: 0, failed: 0, skipped: 0 };
    let continuationToken;
    let previousContinuationToken;

    do {
      const page = await listPage(
        client,
        bucket,
        options.prefix,
        continuationToken,
      );
      await downloadPage(
        client,
        bucket,
        options,
        outputRoot,
        page.Contents ?? [],
        summary,
      );
      previousContinuationToken = continuationToken;
      continuationToken = page.NextContinuationToken;
      if (
        continuationToken &&
        continuationToken === previousContinuationToken
      ) {
        throw new Error('七牛 S3 API 返回了重复 continuation token');
      }
    } while (continuationToken);

    console.log(
      `下载完成 downloaded=${summary.downloaded} skipped=${summary.skipped} failed=${summary.failed}`,
    );
    if (summary.failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    client.destroy();
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`下载终止 ${message}`);
  process.exitCode = 1;
});
