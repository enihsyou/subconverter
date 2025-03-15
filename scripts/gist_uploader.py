#!/usr/bin/env python3
# 虽然 subconverter 已经有 upload 能力了，本脚本是用于上传任意文件
# 特别是 deduplicate 之后的。功能由 Claude 3.7 Sonnet 实现

import sys
import configparser
import json
import argparse
import urllib.request
import urllib.error
import urllib.parse
import logging
from pathlib import Path

# 配置日志记录
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger(__name__)

def parse_config(config_path):
    """解析配置文件，获取Gist相关信息"""
    config = configparser.ConfigParser()
    config.read(config_path)
    
    if 'common' not in config:
        config.add_section('common')
    
    common = config['common']
    if 'token' not in common:
        raise ValueError("配置文件中缺少必要的配置项 token")
    
    # 获取所有部分的URL
    sections_info = {}
    for section in config.sections():
        if section != 'common' and 'url' in config[section] and 'type' in config[section]:
            sections_info[section] = {
                'url': config[section]['url'],
                'type': config[section]['type']
            }
    
    return {
        'gist_id': common.get('id', ''),
        'token': common['token'],
        'username': common.get('username', ''),
        'sections': sections_info,
        'config_obj': config  # 返回配置对象，用于后续更新
    }

def update_config(config_path, config_obj, gist_id, username):
    """更新配置文件，写入新的gist id和username"""
    if 'common' not in config_obj:
        config_obj.add_section('common')
    
    config_obj['common']['id'] = gist_id
    config_obj['common']['username'] = username
    
    with open(config_path, 'w') as configfile:
        config_obj.write(configfile)
    
    logger.info(f"配置文件已更新，gist id: {gist_id}")

def create_gist(token, file_path, file_content, custom_filename=None):
    """创建新的Gist"""
    file_name = custom_filename or Path(file_path).name
    
    api_url = "https://api.github.com/gists"
    headers = {
        'Authorization': f"token {token}",
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
    }
    
    data = {
        "description": f"Uploaded by gist_uploader.py - {file_name}",
        "public": False,
        "files": {
            file_name: {
                "content": file_content
            }
        }
    }
    
    json_data = json.dumps(data).encode('utf-8')
    
    try:
        req = urllib.request.Request(
            api_url, 
            data=json_data, 
            headers=headers, 
            method='POST'
        )
        
        with urllib.request.urlopen(req) as response:
            status_code = response.getcode()
            if status_code == 201:  # 201 Created
                response_data = json.loads(response.read().decode('utf-8'))
                gist_id = response_data['id']
                username = response_data['owner']['login']
                logger.info(f"成功创建Gist! ID: {gist_id}")
                return {
                    'gist_id': gist_id,
                    'username': username
                }
            else:
                logger.error(f"创建Gist失败: 状态码 {status_code}")
                return None
                
    except urllib.error.URLError as e:
        logger.error(f"创建Gist失败: {str(e)}")
        return None

def is_binary_file(file_path):
    """判断文件是否为二进制文件"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            f.read(1024)  # 读取前1024个字符
        return False
    except UnicodeDecodeError:
        return True

def upload_to_gist(file_path, config_info, config_path=None, custom_filename=None):
    """将文件上传到Gist"""
    file_path = Path(file_path)
    if not file_path.exists():
        raise FileNotFoundError(f"找不到指定文件: {file_path}")
    
    # 检查是否为二进制文件
    binary = is_binary_file(file_path)
    if binary:
        logger.warning("检测到二进制文件，Gist可能不支持此类文件，但将尝试上传")
    
    # 读取文件内容
    with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
        file_content = f.read()
    
    # 从文件路径中提取文件名
    file_name = custom_filename or file_path.name
    logger.debug(f"使用文件名: {file_name} 进行上传")
    
    # 检查是否需要创建新的Gist
    if not config_info['gist_id']:
        logger.info("配置中没有Gist ID，将创建新的Gist")
        result = create_gist(config_info['token'], file_path, file_content, custom_filename)
        
        if not result:
            logger.error("创建Gist失败")
            return False
        
        if config_path:
            update_config(
                config_path, 
                config_info['config_obj'], 
                result['gist_id'], 
                result['username']
            )
        
        config_info['gist_id'] = result['gist_id']
        config_info['username'] = result['username']
        logger.info(f"文件 {file_name} 已上传到新创建的Gist!")
        
        raw_url = f"https://gist.githubusercontent.com/{result['username']}/{result['gist_id']}/raw/{file_name}"
        logger.info(f"原始文件可通过以下链接访问:\n{raw_url}")
        return True
    
    # 构建Gist API请求
    api_url = f"https://api.github.com/gists/{config_info['gist_id']}"
    headers = {
        'Authorization': f"token {config_info['token']}",
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
    }
    
    # 获取现有Gist内容
    try:
        req = urllib.request.Request(api_url, headers=headers)
        with urllib.request.urlopen(req) as response:
            if response.getcode() != 200:
                logger.error(f"获取Gist失败: 状态码 {response.getcode()}")
                return False
            # 如果配置中没有username，从响应中获取
            if not config_info['username'] and config_path:
                response_data = json.loads(response.read().decode('utf-8'))
                username = response_data['owner']['login']
                config_info['username'] = username
                update_config(
                    config_path, 
                    config_info['config_obj'], 
                    config_info['gist_id'], 
                    username
                )
    except urllib.error.URLError as e:
        logger.error(f"获取Gist失败: {str(e)}")
        return False
    
    # 准备文件更新
    files_update = {file_name: {"content": file_content}}
    
    # 更新Gist
    data = {"files": files_update}
    json_data = json.dumps(data).encode('utf-8')
    
    try:
        req = urllib.request.Request(
            api_url, 
            data=json_data, 
            headers=headers, 
            method='PATCH'
        )
        
        with urllib.request.urlopen(req) as response:
            status_code = response.getcode()
            if status_code == 200:
                logger.info(f"文件 {file_name} 成功上传到Gist!")
                
                # 输出 Gist 的 URL
                gist_url = f"https://gist.github.com/{config_info['username']}/{config_info['gist_id']}#{file_name}"
                logger.info(f"Gist 可通过以下链接访问:\n{gist_url}")

                # 输出 File 的 URL
                raw_url = f"https://gist.githubusercontent.com/{config_info['username']}/{config_info['gist_id']}/raw/{file_name}"
                logger.info(f"原始文件可通过以下链接访问:\n{raw_url}")
                
                # 输出配置中的URL
                if config_info['sections']:
                    logger.info("配置文件中定义的访问链接:")
                    for section, info in config_info['sections'].items():
                        logger.info(f"- {section} ({info['type']}): {info['url']}")
                
                return True
            else:
                logger.error(f"上传失败: 状态码 {status_code}")
                return False
                
    except urllib.error.URLError as e:
        logger.error(f"上传失败: {str(e)}")
        return False

def main():
    parser = argparse.ArgumentParser(description='将文件上传到GitHub Gist')
    parser.add_argument('file', help='要上传的文件路径')
    parser.add_argument('--config', default='gistconf.ini', help='配置文件路径 (默认: gistconf.ini)')
    parser.add_argument('--debug', action='store_true', help='启用调试模式')
    parser.add_argument('--filename', help='上传到Gist时使用的文件名 (默认使用原始文件名)')
    
    args = parser.parse_args()
    
    # 设置日志级别
    if args.debug:
        logger.setLevel(logging.DEBUG)
        logger.debug("调试模式已启用")
    
    # 确定配置文件的路径
    script_dir = Path(__file__).parent
    project_dir = script_dir.parent
    config_path = project_dir / args.config
    
    if not config_path.exists():
        logger.error(f"找不到配置文件: {config_path}")
        return 1
    
    try:
        config_info = parse_config(config_path)
        upload_to_gist(args.file, config_info, config_path, args.filename)
        return 0
    except Exception as e:
        logger.error(f"错误: {str(e)}")
        if args.debug:
            import traceback
            traceback.print_exc()
        return 1

if __name__ == "__main__":
    sys.exit(main())
