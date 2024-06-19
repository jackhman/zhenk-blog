import fs from 'node:fs'
import path from 'node:path';

// node环境下
export const traverseFolder = function (folderPath) {
    const res = {}
    // 1.获取指定目录下的文章分类目录名  /posts/*
    const files = fs.readdirSync(folderPath)
    // 1.1遍历文件夹列表
    files.forEach((fileName) =>{
        // 拼接当前文件路径
        const filePath = path.join(folderPath, fileName)
        // 判断该路径是文件夹还是文件
        try {
            const stats = fs.statSync(filePath)
            if (stats.isDirectory()) {
                // 如果是文件夹，递归遍历
                // 1.2 保存目录名称
                res[fileName] = {}
            }
        }catch (e){
            console.log(filePath + " 获取statSync失败",e)
        }

    })
    // 2 遍历res /posts/*/*
    Object.keys(res).forEach((key)=>{
        if (key!=='content'){
            var folderNames = fs.readdirSync(path.join(folderPath,key));
            folderNames.forEach((folderName)=>{
                try {
                    fs.statSync(path.join(folderPath,key,folderName)).isDirectory() ?
                        res[key][folderName] = [] :
                        null;
                }catch (e) {
                    console.log("遍历文章目录时发生异常，",e)
                }

            })
        }
    })
    //  遍历/posts/*/*/*.md
    Object.keys(res).forEach((s)=>{
        Object.keys(res[s]).forEach((d)=>{
            var p = path.join(folderPath,s,d);
            var pagePaths = fs.readdirSync(p);
            // 按照文件名中的(number)进行页面排序
            pagePaths.sort((a, b) => {
                const pattern = /^\([0-9]*\)/;
                var arraya = pattern.exec(a);
                var arrayb = pattern.exec(b);
                let i, j;
                if (arraya != null && arrayb != null) {
                    i = parseInt(arraya[0].split("[").join("").split("]").join(""));
                    j = parseInt(arrayb[0].split("[").join("").split("]").join(""))
                }

                if (i < j) {
                    return -1
                } else if (i === j) {
                    return 0
                } else {
                    return 1
                }
            })
            pagePaths.forEach((pagePath)=>{
                const j = path.join(p, pagePath);
                try {
                    fs.statSync(j).isFile() ?
                        res[s][d].push(path.basename(j,path.extname(j))):
                        null;
                }catch (e) {
                    console.log("遍历文章时发生异常,",e)
                }

            })

        })
    })
    return res;
}


export const generatePostsSidebar =  function generatePostsSidebar(data){
    const res = {}
    const pattern = /^\([0-9]*\)\s*/;

    Object.keys(data).forEach((sDir)=>{
        Object.keys(data[sDir]).forEach((pDir)=>{
            const pageUrls = data[sDir][pDir];
            const items = []
            const baseAndPrefix = '/posts/'+sDir+'/'+pDir+'/'
            pageUrls.forEach((pageUrl)=>{
                const r = pattern.exec(pageUrl);
                const p = pageUrl.replace(r,"")
                items.push({
                    text: p,
                    link: baseAndPrefix+pageUrl
                })
            })

            res[baseAndPrefix]={
                text: pDir,
                items: items
            }
        })
    })
    return res
}

const res = {};
res.folder = traverseFolder('posts');
res.sirderBar = generatePostsSidebar(res.folder)
export default {
    load() {
        return res
    }
}
