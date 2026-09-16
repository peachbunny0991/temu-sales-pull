# -*- coding: utf-8 -*-
"""
Temu SKC 产品主图批量下载
用法: python3 download_images.py --urls <skc_urls.json> --out <imgs_dir> --store golf
urls.json 格式: {"skcId": "https://img.kwcdn.com/product/fancy/....jpg?imageMogr2/thumbnail/120x"}
- 自动把 URL 中 imageMogr2/thumbnail/120x 换成 800x 得到高清图
- 输出 <imgs_dir>/<store>_<skcId>.jpg
"""
import argparse, json, os, re, sys, urllib.request

def hd_url(u):
    return u.replace("imageMogr2/thumbnail/120x", "imageMogr2/thumbnail/800x") if "imageMogr2" in u else u

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--urls", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--store", default="golf")
    args = ap.parse_args()

    urls = json.load(open(args.urls, encoding="utf-8"))
    os.makedirs(args.out, exist_ok=True)
    ok, fail = 0, []
    for skc, u in urls.items():
        dst = os.path.join(args.out, "%s_%s.jpg" % (args.store, skc))
        if os.path.isfile(dst) and os.path.getsize(dst) > 5000:
            ok += 1
            continue
        try:
            req = urllib.request.Request(hd_url(u), headers={"User-Agent": "Mozilla/5.0"})
            data = urllib.request.urlopen(req, timeout=30).read()
            if len(data) < 5000:
                fail.append((skc, "too small %d" % len(data)))
                continue
            with open(dst, "wb") as f:
                f.write(data)
            ok += 1
        except Exception as e:
            fail.append((skc, str(e)))
    print("下载完成: ok=%d fail=%d" % (ok, len(fail)))
    for skc, err in fail:
        print("  FAIL %s: %s" % (skc, err))
    if fail:
        sys.exit(1)

if __name__ == "__main__":
    main()
