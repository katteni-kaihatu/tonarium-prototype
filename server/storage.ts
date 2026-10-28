import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { CreateBucketCommand, DeleteObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

/** 画像や動画の置き場。本番は R2、手元は SeaweedFS、S3 の設定が無いとき（テスト）は DATA_DIR/objects */
export interface ObjectStorage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** ブラウザが直接読む URL */
  url(key: string): string;
}

/** キーは自分で作った ID だけにする前提だが、念のため外へ出られないものに限る */
const KEY_RE = /^[a-z0-9-]+(\/[a-z0-9-]+)*\.[a-z0-9]+$/;
function checkKey(key: string) {
  if (!KEY_RE.test(key)) throw new Error(`使えないキーです: ${key}`);
}

export class FileStorage implements ObjectStorage {
  constructor(readonly dir: string, private readonly base = '/objects') {}
  async put(key: string, body: Buffer) {
    checkKey(key);
    const file = path.join(this.dir, key);
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${randomUUID()}.tmp`;
    await fs.promises.writeFile(tmp, body);
    await fs.promises.rename(tmp, file);
  }
  async delete(key: string) {
    checkKey(key);
    await fs.promises.rm(path.join(this.dir, key), { force: true });
  }
  url(key: string) {
    checkKey(key);
    return `${this.base}/${key}`;
  }
  /** url() の配信元（サーバーの /objects/）が読むファイル */
  file(key: string) {
    checkKey(key);
    return path.join(this.dir, key);
  }
}

export interface S3Options {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicUrl: string;
  prefix: string;
}

export class S3Storage implements ObjectStorage {
  private readonly client: S3Client;
  constructor(private readonly o: S3Options) {
    // R2 も SeaweedFS もパス形式で受けるので、バケット名のサブドメインを使わない
    this.client = new S3Client({ endpoint: o.endpoint, region: o.region, forcePathStyle: true, credentials: { accessKeyId: o.accessKeyId, secretAccessKey: o.secretAccessKey } });
  }
  async ensureBucket() {
    try { await this.client.send(new HeadBucketCommand({ Bucket: this.o.bucket })); }
    catch { await this.client.send(new CreateBucketCommand({ Bucket: this.o.bucket })); }
  }
  async put(key: string, body: Buffer, contentType: string) {
    checkKey(key);
    // キーは中身ごとに新しくするので、配信側でずっとキャッシュしてよい
    await this.client.send(new PutObjectCommand({ Bucket: this.o.bucket, Key: this.o.prefix + key, Body: body, ContentType: contentType, CacheControl: 'public, max-age=31536000, immutable' }));
  }
  async delete(key: string) {
    checkKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.o.bucket, Key: this.o.prefix + key }));
  }
  url(key: string) {
    checkKey(key);
    return `${this.o.publicUrl.replace(/\/$/, '')}/${this.o.prefix}${key}`;
  }
}

/** 環境変数から置き場を決める。dotenv を読んだ後に呼ぶこと */
export async function openStorage(dataDir: string, env = process.env): Promise<ObjectStorage> {
  if (!env.S3_ENDPOINT) return new FileStorage(path.join(dataDir, 'objects'));
  const need = (name: string) => {
    const v = env[name];
    if (!v) throw new Error(`S3_ENDPOINT を設定したときは ${name} も必要です`);
    return v;
  };
  const storage = new S3Storage({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION || 'auto',
    bucket: need('S3_BUCKET'),
    accessKeyId: need('S3_ACCESS_KEY_ID'),
    secretAccessKey: need('S3_SECRET_ACCESS_KEY'),
    publicUrl: need('S3_PUBLIC_URL'),
    prefix: env.S3_PREFIX ?? '',
  });
  // 手元の SeaweedFS は起動したてでバケットが無いので作る。本番の R2 は先に用意しておく
  if (env.S3_CREATE_BUCKET === '1') await storage.ensureBucket();
  return storage;
}
