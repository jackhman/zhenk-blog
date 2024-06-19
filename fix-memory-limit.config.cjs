// 运行项目前通过node执行此脚本 （此脚本与node_modules 目录同级）
const fs = require('fs')
const path = require('path')
const wfPath = path.resolve(__dirname,'./node_modules/.bin')

fs.readdir(wfPath,(err,files)=>{
    if(err){
        console.log(err)
    }else{
        if(files.length != 0){
            files.forEach(item => {
                if(item.split('.')[1] === 'cmd'){
                    replaceStr(`${wfPath}/${item}`,/"%_prog%"/,'%_prog%')
                }
            })
        }
    }
})

function replaceStr(filePath,sourceRegx,targetSrt){
    fs.readFile(filePath,(err,data) =>{
        if(err){
            console.log(err)
        }else{
            let str = data.toString()
            str = str.replace(sourceRegx,targetSrt)
            fs.writeFile(filePath,str,err => {
                console.log(err)
            })
        }
    })
}