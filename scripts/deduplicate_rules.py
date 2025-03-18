import logging
import sys
from pathlib import Path
from ruamel.yaml import YAML

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(message)s',
    handlers=[
        logging.StreamHandler()
    ]
)


def deduplicate_rules(file_path, in_place=False, verbose=False):
    file_path = Path(file_path)
    # 读取 YAML 文件
    yaml = YAML()
    yaml.preserve_quotes = True
    yaml.indent(mapping=2, sequence=4, offset=2)
    yaml.width = float('inf')  # 设置无限宽度，防止长对象换行
    try:
        with open(file_path, 'r', encoding='utf-8') as file:
            config = yaml.load(file)
    except Exception as e:
        logging.error(f"Error reading file: {e}")
        return None

    if 'rules' not in config:
        logging.error("No 'rules' found in the YAML file")
        return None

    original_rules = config['rules']
    seen_keys = {}
    deduplicated_rules = []
    duplicates = []

    if not verbose:
        logging.info("In non-verbose mode, only duplicate rules with different groups will be shown")

    for rule in original_rules:
        # 获取前两个元素作为唯一键
        parts = rule.split(',', 2)  # 最多分割2次，保证只获取前两个元素
        if len(parts) >= 2:
            key = f"{parts[0]},{parts[1]}"

            if key not in seen_keys:
                seen_keys[key] = rule
                deduplicated_rules.append(rule)
            else:
                # 获取原始规则首次出现时的第三个元素
                first_occurrence_parts = seen_keys[key].split(',', 2)
                first_occurrence_group = first_occurrence_parts[2] if len(
                    first_occurrence_parts) > 2 else ''
                current_group = parts[2] if len(parts) > 2 else ''
                
                duplicates.append((rule, seen_keys[key]))
                # 只在 verbose 模式下或第三个元素不同时输出日志
                if verbose or (current_group != first_occurrence_group):
                    logging.info(
                        f"Filtered out duplicate rule: {rule} (First occurrence: {first_occurrence_group})")
        else:
            # 如果规则格式不符合预期，保留它并记录日志
            logging.warning(f"Unusual rule format kept as is: {rule}")
            deduplicated_rules.append(rule)

    # 统计过滤情况
    filtered_count = len(original_rules) - len(deduplicated_rules)
    logging.info(f"Total rules: {len(original_rules)}")
    logging.info(f"Rules after deduplication: {len(deduplicated_rules)}")
    logging.info(f"Filtered rules: {filtered_count}")

    if filtered_count == 0:
        logging.info("No duplicates found!")
        return None

    # 更新配置并保存
    config['rules'] = deduplicated_rules

    if in_place:
        output_path = file_path
    else:
        # 构建输出文件路径
        dirname = file_path.parent
        filename = file_path.stem
        ext = file_path.suffix
        output_path = dirname / f"{filename}_deduplicated{ext}"

    try:
        with open(output_path, 'w', encoding='utf-8') as file:
            yaml.dump(config, file)

        logging.info(f"\nDeduplicated file saved at: {output_path}")
        return output_path
    except Exception as e:
        logging.error(f"Error saving file: {e}")
        return None


if __name__ == "__main__":
    if len(sys.argv) > 1:
        file_path = sys.argv[1]
        in_place = len(sys.argv) > 2 and sys.argv[2].lower() in (
            '--in-place', '-i')
        verbose = len(sys.argv) > 2 and '--verbose' in sys.argv[2:]
    else:
        file_path = input("Enter the path to the YAML file: ")
        in_place = input("Update file in-place? (y/n): ").lower() == 'y'
        verbose = input("Enable verbose output? (y/n): ").lower() == 'y'

    deduplicate_rules(file_path, in_place, verbose)
