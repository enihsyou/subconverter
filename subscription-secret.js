// 从环境变量文件中读取机密信息
//
// 利用了 script: 特性，subconverter 会寻找 parse() 函数，环境支持 quickjs 库
// 调用方的代码在这里，由 subconverter-profile.ini 驱动
// https://github.com/tindy2013/subconverter/blob/92f66bf5b58be5b3e605bb481db5f5ffd6b2aa78/src/generator/config/nodemanip.cpp#L56
// 甚至 subconverter 的实现里还有个 RCE，https://rce.moe/2022/08/23/WMCTF-2022-WRITEUP#RCE
function parse(token_file) {
    token_file ??= ".subconverter_env";

    let url = "";
    if (isSafeFile(token_file)) {
        let fd = std.open(token_file, "r");
        url = fd && fd.getline();
        fd && fd.close();
    }
    return url;
}

// 简单的检测限制只能访问当前目录
function isSafeFile(file) {
    return file && !(file.includes("..") || file.includes(":") || file.startsWith("/"));
}
