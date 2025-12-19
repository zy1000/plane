import re
def split_by_numbering(text):
    # 按照 "1. xxx", "2. xxx" 分割文本，但只匹配纯数字+点开头的行首
    pattern = r'(\d+\.)\s*(.*?)(?=\n\d+\.|\Z)'
    matches = re.findall(pattern, text.strip(), re.DOTALL)
    return {int(num[:-1]): content.strip() for num, content in matches}


def build_description_result_list(data):
    desc_dict = split_by_numbering(data['description'])
    res_dict = split_by_numbering(data['result'])

    result_list = []
    # 遍历所有出现在 description 中的编号
    for key in sorted(desc_dict.keys()):
        description_text = desc_dict[key]
        result_text = res_dict.get(key, "")  # 若无对应结果则返回空字符串
        result_list.append({
            "description": description_text,
            "result": result_text
        })

    return result_list

data = {
    'description': '''1.校时到门限1时间段,读取Table4中所有参数
2.读取当前时间为T1，门限1加超负载条件(获取obtain_load_type,判定负载)，等待时间start_time_threshold*0.7
3.检查Table4中所有参数
4.再等待start_time_threshold*0.3+2s，读取当前时间为T2，检查Table4中所有参数，与步骤3进行比较
5.切换为恢复负载条件，等待end_time_threshold*0.7时间
6.检查Table4中所有参数，与步骤4进行比较
7.等待end_time_threshold*0.3+2s时间，检查Table4中所有参数，与步骤4进行比较
8.获取threshold_number个数，大于1时校时到其他门限测试''',
    'result': '''3.与步骤1一致，无变化
4.
1）继电器状态：满足table5中逻辑
2）必须事件：
Disconnector_Event_Log有新增事件
a:over_load_detection、时间戳：T1+start_time_threshold+1BT(BT:表台补偿次数)
b:relay_off_for_over_load、时间戳：T1+start_time_threshold+1BT(BT:表台补偿次数)
6.与步骤1一致，无变化
7.
1）继电器状态：满足table5中逻辑
2）必须事件：
Disconnector_Event_Log有新增事件
a:over_load_restore、时间戳：T2+end_time_threshold+1BT(BT:表台补偿次数)
当步骤7中继电器状态为[1,1]时，必须事件还应产生事件b
b:relay_on_for_over_load_restore、时间戳：T2+end_time_threshold+1BT(BT:表台补偿次数)
8.其他门限均正常'''
}
from pprint import pprint
output = build_description_result_list(data)
pprint(output)

