import argparse

import pandas as pd
from typing import List, Dict, Any, Optional
import psycopg2
from psycopg2.extras import RealDictCursor

from datetime import datetime, timezone, timedelta

# 计算一周前
one_week_ago = datetime.now() - timedelta(days=7)

# 格式化为 'YYYY-MM-DD'
date_str = one_week_ago.strftime('%Y-%m-%d')

workspace_dict = {'efc1b3eb-9152-4225-95e6-390690416e65': 'KFCD', }
workspace_display_dict = {'efc1b3eb-9152-4225-95e6-390690416e65': 'kfcd',}

connection = psycopg2.connect(
    host='192.168.100.225',
    user='plane',
    port=5432,
    password='plane',
    database='plane',
)
cursor = connection.cursor(cursor_factory=RealDictCursor)

test_user = [
    {"id": "1768", "name": "钟长会", "login_name": "changhuizhong", "token": "2445ac6f-b5a1-4681-8e40-4131df9928c2"},
    {"id": "1845", "name": "李妮", "login_name": "nili", "token": "65690904-252f-43d3-b40c-d9cc712a8696"},
    {"id": "2075", "name": "王吉平", "login_name": "jipingwang", "token": "90efe0bb-995a-4ef8-a48d-8db5137fbd0f"},
    {"id": "2313", "name": "姚强", "login_name": "qiangyao", "token": "5a2fe183-8ff5-418e-939d-57586c0e07f8"},
    {"id": "2532", "name": "欧秋洁", "login_name": "qiujieou", "token": "24941c53-0173-4103-9397-0934240c6bc1"},
    {"id": "2578", "name": "戢俊萍", "login_name": "junpingji", "token": "130ceeb8-1786-4009-87d2-8a809883b7ca"},
    {"id": "2608", "name": "何洽", "login_name": "qiahe", "token": "7eaa5ffa-78a0-43dc-9b2b-8475b721669e"},
    {"id": "2650", "name": "杨玉柱", "login_name": "yuzhuyang", "token": "ca0bbfb6-294c-4c60-9652-d50dd99fd3d6"},
    {"id": "2669", "name": "何红林", "login_name": "honglinhe", "token": "8017b4a9-84b4-4910-be67-0e06d82a372e"},
    {"id": "2681", "name": "林铜浩", "login_name": "tonghaolin", "token": "920373f5-58a8-4f8b-aebb-ae4d70c9c65c"},
    {"id": "2759", "name": "李秋凤", "login_name": "qiufengli", "token": "63a55504-e5b7-4069-a57a-06268501ce96"},
    {"id": "2784", "name": "胡洸瑞", "login_name": "guangruihu", "token": "4f58b9ad-b83d-4a47-b58b-35cf82f01dae"},
    {"id": "2800", "name": "董煣", "login_name": "roudong", "token": "54e67cb8-15cc-482e-92ff-2ebdbeae3a28"},
    {"id": "2811", "name": "赵超锐", "login_name": "chaoruizhao", "token": "a016a5f4-42f4-4600-a0ac-f7242d82f785"},
    {"id": "2813", "name": "车琴芳", "login_name": "qinfangche", "token": "48473ae1-1dba-4964-a20d-9c9e9bf9519d"},
    {"id": "2931", "name": "戴辉林", "login_name": "huilindai", "token": "7014d47d-3d65-44ab-a644-d1eed28d743e"},
    {"id": "2932", "name": "黄钰斐", "login_name": "yufeihuang", "token": "9f518d64-e0bf-4d15-80e4-73fe59b2f418"},
    {"id": "2941", "name": "郑宇", "login_name": "yuzheng3", "token": "f1a91d47-94a8-45fc-b1e9-ddbb0a5f638f"},
    {"id": "2942", "name": "林格", "login_name": "gelin", "token": "d435c185-e2d5-4dcb-81d5-494958bb01e3"},
    {"id": "2957", "name": "游鑫", "login_name": "xinyou", "token": "3ae1a2de-495e-4751-91c3-1ab9a07df6d9"},
    {"id": "2961", "name": "何颖", "login_name": "yinghe2", "token": "763ce760-1834-4c42-8734-c0d463fd4ce9"},
    {"id": "2963", "name": "青娜", "login_name": "naqing", "token": "0985093b-828c-4764-b367-dabe011b95b9"},
    {"id": "2974", "name": "熊沫", "login_name": "moxiong", "token": "3404dc41-e48b-472d-85f8-f8d524ceb565"},
    {"id": "2976", "name": "付红铮", "login_name": "hongzhengfu1", "token": "33dc19fb-a44b-448e-871c-9b69dfac2532"},
    {"id": "3010", "name": "阮飞鹏", "login_name": "feipengruan", "token": "beb3d930-a7fb-468f-b46f-3f082dfb10f2"},
    {"id": "3013", "name": "张智发", "login_name": "zhifazhang", "token": "a47ee987-e0a5-4fc1-918a-c625d50a12fc"},
    {"id": "3044", "name": "朱鑫方", "login_name": "xinfangzhu", "token": "ec6b0043-94a1-46fd-972e-9b1c897f8ed2"}],
all_user = [{"id": "1708", "name": "陈亚", "login_name": "yachen"},
            {"id": "1709", "name": "李楚岑", "login_name": "chucenli"},
            {"id": "1714", "name": "易阳威", "login_name": "yangweiyi"},
            {"id": "1715", "name": "谢红涛", "login_name": "hongtaoxie"},
            {"id": "1717", "name": "丁超", "login_name": "chaoding"},
            {"id": "1718", "name": "黄建超", "login_name": "jianchaohuang"},
            {"id": "1719", "name": "周蕾蕾", "login_name": "leileizhou"},
            {"id": "1720", "name": "覃精华", "login_name": "jinghuaqin"},
            {"id": "1721", "name": "张姣", "login_name": "jiaozhang"},
            {"id": "1724", "name": "覃艳", "login_name": "yanqin"},
            {"id": "1727", "name": "龚勋", "login_name": "xungong"},
            {"id": "1730", "name": "许燕", "login_name": "yanxu"},
            {"id": "1731", "name": "韩晓", "login_name": "xiaohan"},
            {"id": "1734", "name": "钟志林", "login_name": "zhilinzhong"},
            {"id": "1735", "name": "凌健强", "login_name": "jianqiangling"},
            {"id": "1736", "name": "鞠锐", "login_name": "ruiju"},
            {"id": "1740", "name": "丘建忠", "login_name": "jianzhongqiu"},
            {"id": "1742", "name": "王春国", "login_name": "chunguowang"},
            {"id": "1743", "name": "谭万锋", "login_name": "wanfengtan"},
            {"id": "1744", "name": "邢家泰", "login_name": "jiataixing"},
            {"id": "1746", "name": "全沅生", "login_name": "yuanshengquan"},
            {"id": "1748", "name": "王毅", "login_name": "yiwang"},
            {"id": "1749", "name": "黄迪", "login_name": "dihuang"},
            {"id": "1751", "name": "李福鑫", "login_name": "fuxinli"},
            {"id": "1752", "name": "刘华金", "login_name": "huajinliu"},
            {"id": "1753", "name": "曾凡华", "login_name": "fanhuazeng"},
            {"id": "1754", "name": "刘杰", "login_name": "jieliu2"},
            {"id": "1758", "name": "李亮", "login_name": "liangli1"},
            {"id": "1760", "name": "赵文锋", "login_name": "wenfengzhao"},
            {"id": "1761", "name": "韩静非", "login_name": "jingfeihan"},
            {"id": "1762", "name": "薛诚星", "login_name": "chengxingxue"},
            {"id": "1764", "name": "张广双", "login_name": "guangshuangzhang"},
            {"id": "1765", "name": "代富民", "login_name": "fumindai"},
            {"id": "1766", "name": "陈俊杰", "login_name": "junjiechen"},
            {"id": "1767", "name": "李敏", "login_name": "minli2"},
            {"id": "1768", "name": "钟长会", "login_name": "changhuizhong"},
            {"id": "1769", "name": "舒春瑶", "login_name": "chunyaoshu"},
            {"id": "1772", "name": "何乐涛", "login_name": "letaohe"},
            {"id": "1776", "name": "袁德彩", "login_name": "decaiyuan"},
            {"id": "1780", "name": "颜杰", "login_name": "jieyan"},
            {"id": "1783", "name": "曹倩", "login_name": "qiancao"},
            {"id": "1784", "name": "王惜珍", "login_name": "xizhenwang"},
            {"id": "1794", "name": "李佩伦", "login_name": "peilunli"},
            {"id": "1795", "name": "罗勇", "login_name": "yongluo3"},
            {"id": "1839", "name": "傅贤福", "login_name": "xianfufu"},
            {"id": "1840", "name": "牛彦彬", "login_name": "yanbinniu"},
            {"id": "1845", "name": "李妮", "login_name": "nili"},
            {"id": "1847", "name": "朱子杰", "login_name": "zijiezhu"},
            {"id": "1856", "name": "原凯阳", "login_name": "kaiyangyuan"},
            {"id": "1861", "name": "丁川", "login_name": "chuanding"},
            {"id": "1863", "name": "付雪梅", "login_name": "xuemeifu"},
            {"id": "1865", "name": "贺建福", "login_name": "jianfuhe"},
            {"id": "1866", "name": "蒋佳秀", "login_name": "jiaxiujiang"},
            {"id": "1867", "name": "李春江", "login_name": "chunjiangli"},
            {"id": "1868", "name": "李国强", "login_name": "guoqiangli1"},
            {"id": "1871", "name": "潘尧舜", "login_name": "yaoshunpan"},
            {"id": "1872", "name": "秦国兴", "login_name": "guoxingqin"},
            {"id": "1874", "name": "王东宁", "login_name": "dongningwang"},
            {"id": "1876", "name": "王柯", "login_name": "kewang"},
            {"id": "1877", "name": "王银霜", "login_name": "yinshuangwang"},
            {"id": "1879", "name": "谢明鑫", "login_name": "mingxinxie"},
            {"id": "1880", "name": "谢生智", "login_name": "shengzhixie"},
            {"id": "1881", "name": "杨戬", "login_name": "jianyang1"},
            {"id": "1882", "name": "杨龙", "login_name": "longyang"},
            {"id": "1885", "name": "张超彬", "login_name": "chaobinzhang"},
            {"id": "1886", "name": "张良柱", "login_name": "liangzhuzhang"},
            {"id": "1890", "name": "戚冬丽", "login_name": "dongliqi"},
            {"id": "1892", "name": "朱福民", "login_name": "fuminzhu"},
            {"id": "1893", "name": "王波", "login_name": "bowang2"},
            {"id": "1903", "name": "王龙和", "login_name": "longhewang"},
            {"id": "1906", "name": "何为", "login_name": "weihe"},
            {"id": "1907", "name": "陈宁", "login_name": "ningchen"},
            {"id": "1909", "name": "邹京亚", "login_name": "jingyazou"},
            {"id": "1914", "name": "高华卿", "login_name": "huaqinggao1"},
            {"id": "1915", "name": "王志远", "login_name": "zhiyuanwang"},
            {"id": "1918", "name": "罗登兵", "login_name": "dengbingluo"},
            {"id": "1923", "name": "牟昌勇", "login_name": "changyongmou"},
            {"id": "1924", "name": "张国平", "login_name": "guopingzhang"},
            {"id": "1926", "name": "姜生龙", "login_name": "shenglongjiang"},
            {"id": "1928", "name": "朱伟杰", "login_name": "weijiezhu"},
            {"id": "1931", "name": "曹勇军", "login_name": "yongjuncao"},
            {"id": "1933", "name": "卢湘滨", "login_name": "xiangbinlu"},
            {"id": "1936", "name": "易兵", "login_name": "bingyi"},
            {"id": "1941", "name": "周璇", "login_name": "xuanzhou"},
            {"id": "1954", "name": "魏敏", "login_name": "minwei"},
            {"id": "1960", "name": "秦莉萍", "login_name": "lipingqin"},
            {"id": "1976", "name": "刘敏", "login_name": "minliu"},
            {"id": "2000", "name": "郭婷", "login_name": "tingguo"},
            {"id": "2007", "name": "郑画中", "login_name": "huazhongzheng"},
            {"id": "2008", "name": "余贵", "login_name": "guiyu"},
            {"id": "2009", "name": "覃有仪", "login_name": "youyiqin"},
            {"id": "2010", "name": "汪东良", "login_name": "dongliangwang"},
            {"id": "2014", "name": "周波", "login_name": "bozhou"},
            {"id": "2049", "name": "孟令翔", "login_name": "lingxiangmeng"},
            {"id": "2065", "name": "李灯", "login_name": "dengli"},
            {"id": "2075", "name": "王吉平", "login_name": "jipingwang"},
            {"id": "2077", "name": "凌吉荣", "login_name": "kylim"},
            {"id": "2098", "name": "徐超", "login_name": "chaoxu"},
            {"id": "2102", "name": "王钱莉", "login_name": "qianliwang"},
            {"id": "2103", "name": "朱光云", "login_name": "guangyunzhu"},
            {"id": "2110", "name": "江海波", "login_name": "haibojiang"},
            {"id": "2111", "name": "胡光泽", "login_name": "guangzehu"},
            {"id": "2113", "name": "江秀汀", "login_name": "xiutingjiang"},
            {"id": "2114", "name": "田欢", "login_name": "huantian"},
            {"id": "2117", "name": "徐银全", "login_name": "yinquanxu"},
            {"id": "2120", "name": "刘承万", "login_name": "chengwanliu"},
            {"id": "2122", "name": "林莉", "login_name": "lilin"},
            {"id": "2126", "name": "贾飞", "login_name": "feijia"},
            {"id": "2139", "name": "彭伟", "login_name": "weipeng1"},
            {"id": "2143", "name": "陈黎", "login_name": "lichen3"},
            {"id": "2146", "name": "梅林", "login_name": "linmei"},
            {"id": "2147", "name": "刘耘松", "login_name": "yunsongliu"},
            {"id": "2148", "name": "李金凤", "login_name": "jinfengli"},
            {"id": "2151", "name": "李跃", "login_name": "yueli"},
            {"id": "2161", "name": "谢晓林", "login_name": "xiaolinxie"},
            {"id": "2163", "name": "向菲雪", "login_name": "feixuexiang"},
            {"id": "2170", "name": "李知远", "login_name": "zhiyuanli"},
            {"id": "2174", "name": "李强", "login_name": "qiangli2"},
            {"id": "2182", "name": "谢爽", "login_name": "shuangxie"},
            {"id": "2183", "name": "杨锋荣", "login_name": "fengrongyang"},
            {"id": "2185", "name": "王丹", "login_name": "danwang"},
            {"id": "2189", "name": "汪克翠", "login_name": "kecuiwang"},
            {"id": "2191", "name": "杨刚", "login_name": "gangyang"},
            {"id": "2200", "name": "肖桂林", "login_name": "guilinxiao"},
            {"id": "2201", "name": "王启容", "login_name": "qirongwang"},
            {"id": "2203", "name": "米青花", "login_name": "qinghuami"},
            {"id": "2205", "name": "章恒", "login_name": "hengzhang"},
            {"id": "2207", "name": "田嵋", "login_name": "meitian"},
            {"id": "2212", "name": "万步春", "login_name": "buchunwan"},
            {"id": "2217", "name": "蒲彬", "login_name": "binpu"},
            {"id": "2218", "name": "王倩", "login_name": "qianwang"},
            {"id": "2230", "name": "王亚非", "login_name": "yafeiwang"},
            {"id": "2233", "name": "邓绚", "login_name": "xuandeng"},
            {"id": "2234", "name": "吕杰勤", "login_name": "jieqinlv"},
            {"id": "2236", "name": "张东林", "login_name": "donglinzhang"},
            {"id": "2242", "name": "王萌", "login_name": "mengwang"},
            {"id": "2244", "name": "钟浩然", "login_name": "haoranzhong"},
            {"id": "2245", "name": "卢正笛", "login_name": "zhengdilu"},
            {"id": "2246", "name": "赵仕玲", "login_name": "shilingzhao"},
            {"id": "2247", "name": "雷广源", "login_name": "guangyuanlei"},
            {"id": "2255", "name": "邹栋", "login_name": "dongzou"},
            {"id": "2267", "name": "尹成钢", "login_name": "chenggangyin"},
            {"id": "2271", "name": "张成河", "login_name": "chenghezhang"},
            {"id": "2272", "name": "何静", "login_name": "jinghe"},
            {"id": "2275", "name": "陈新玺", "login_name": "xinxichen"},
            {"id": "2278", "name": "王凤", "login_name": "fengwang3"},
            {"id": "2280", "name": "史云智", "login_name": "yunzhishi"},
            {"id": "2283", "name": "杨阳", "login_name": "yangyang4"},
            {"id": "2289", "name": "王昊", "login_name": "haowang2"},
            {"id": "2293", "name": "王丽", "login_name": "liwang1"},
            {"id": "2295", "name": "周星", "login_name": "xingzhou"},
            {"id": "2298", "name": "殷竹", "login_name": "zhuyin"},
            {"id": "2301", "name": "丁智花", "login_name": "zhihuading"},
            {"id": "2304", "name": "文浩", "login_name": "haowen"},
            {"id": "2308", "name": "闫奥博", "login_name": "aoboyan"},
            {"id": "2309", "name": "黄富贵", "login_name": "fuguihuang"},
            {"id": "2313", "name": "姚强", "login_name": "qiangyao"},
            {"id": "2316", "name": "李强", "login_name": "qiangli5"},
            {"id": "2317", "name": "杨过", "login_name": "guoyang"},
            {"id": "2326", "name": "尹华汶", "login_name": "huawenyin"},
            {"id": "2329", "name": "王伟全", "login_name": "weiquanwang"},
            {"id": "2330", "name": "吴红", "login_name": "hongwu"},
            {"id": "2332", "name": "王秋雪", "login_name": "qiuxuewang"},
            {"id": "2333", "name": "何杰良", "login_name": "jielianghe"},
            {"id": "2340", "name": "余泫岑", "login_name": "xuancenyu"},
            {"id": "2342", "name": "李胜彬", "login_name": "shengbinli"},
            {"id": "2345", "name": "牟毅", "login_name": "yimou"},
            {"id": "2347", "name": "杜洪平", "login_name": "hongpingdu"},
            {"id": "2352", "name": "王祥麟", "login_name": "xianglinwang"},
            {"id": "2357", "name": "王洪伟", "login_name": "hongweiwang1"},
            {"id": "2359", "name": "江冰", "login_name": "bingjiang1"},
            {"id": "2360", "name": "杨霞", "login_name": "xiayang1"},
            {"id": "2364", "name": "朱海双", "login_name": "haishuangzhu"},
            {"id": "2365", "name": "陈东明", "login_name": "dongmingchen"},
            {"id": "2366", "name": "贺力", "login_name": "lihe1"},
            {"id": "2369", "name": "袁叶", "login_name": "yeyuan"},
            {"id": "2375", "name": "毛亚兰", "login_name": "yalanmao"},
            {"id": "2379", "name": "陈莉蓉", "login_name": "lirongchen"},
            {"id": "2386", "name": "董天崇", "login_name": "tianchongdong"},
            {"id": "2388", "name": "文立豪", "login_name": "lihaowen"},
            {"id": "2390", "name": "贾子伟", "login_name": "ziweijia"},
            {"id": "2394", "name": "张莉", "login_name": "lizhang3"},
            {"id": "2400", "name": "吴陈毅", "login_name": "chenyiwu"},
            {"id": "2402", "name": "魏明明", "login_name": "mingmingwei"},
            {"id": "2404", "name": "易德鸿", "login_name": "dehongyi"},
            {"id": "2430", "name": "柏泠铨", "login_name": "lingquanbai"},
            {"id": "2434", "name": "瞿润平", "login_name": "runpingqu"},
            {"id": "2435", "name": "邓迎华", "login_name": "yinghuadeng"},
            {"id": "2456", "name": "刘源坤", "login_name": "yuankunliu"},
            {"id": "2464", "name": "曾永", "login_name": "yongzeng2"},
            {"id": "2475", "name": "杨鑫", "login_name": "xinyang1"},
            {"id": "2480", "name": "黄菊", "login_name": "juhuang"},
            {"id": "2484", "name": "杨建鑫", "login_name": "jianxinyang"},
            {"id": "2485", "name": "吴晓荣", "login_name": "xiaorongwu1"},
            {"id": "2487", "name": "李青青", "login_name": "qingqingli2"},
            {"id": "2488", "name": "颜辉", "login_name": "huiyan"},
            {"id": "2490", "name": "杨静", "login_name": "jingyang"},
            {"id": "2491", "name": "黄涛", "login_name": "taohuang1"},
            {"id": "2492", "name": "刘浩", "login_name": "haoliu4"},
            {"id": "2493", "name": "王东林", "login_name": "donglinwang"},
            {"id": "2494", "name": "黄大彬", "login_name": "dabinhuang"},
            {"id": "2495", "name": "米飞虎", "login_name": "feihumi"},
            {"id": "2497", "name": "王天宇", "login_name": "tianyuwang"},
            {"id": "2499", "name": "何涛涛", "login_name": "taotaohe"},
            {"id": "2500", "name": "李果", "login_name": "guoli"},
            {"id": "2502", "name": "杨乐", "login_name": "leyang"},
            {"id": "2503", "name": "贾艺", "login_name": "yijia"},
            {"id": "2511", "name": "陈林", "login_name": "linchen"},
            {"id": "2513", "name": "雷霜", "login_name": "shuanglei"},
            {"id": "2518", "name": "魏帆", "login_name": "fanwei"},
            {"id": "2526", "name": "吴崇阳", "login_name": "chongyangwu"},
            {"id": "2527", "name": "辜瑞东", "login_name": "ruidonggu"},
            {"id": "2529", "name": "冯阳", "login_name": "yangfeng"},
            {"id": "2531", "name": "邓秋", "login_name": "qiudeng"},
            {"id": "2532", "name": "欧秋洁", "login_name": "qiujieou"},
            {"id": "2533", "name": "崔月红", "login_name": "yuehongcui"},
            {"id": "2535", "name": "杨希", "login_name": "xiyang1"},
            {"id": "2537", "name": "杨云贺", "login_name": "yunheyang"},
            {"id": "2539", "name": "熊杰", "login_name": "jiexiong1"},
            {"id": "2540", "name": "蒲筱君", "login_name": "xiaojunpu"},
            {"id": "2546", "name": "熊伯龙", "login_name": "bolongxiong"},
            {"id": "2554", "name": "蒋月", "login_name": "yuejiang"},
            {"id": "2558", "name": "黄静", "login_name": "jinghuang2"},
            {"id": "2559", "name": "王治平", "login_name": "zhipingwang"},
            {"id": "2560", "name": "钟琦晖", "login_name": "qihuizhong"},
            {"id": "2578", "name": "戢俊萍", "login_name": "junpingji"},
            {"id": "2588", "name": "朱红芳", "login_name": "hongfangzhu"},
            {"id": "2592", "name": "胡曾昱", "login_name": "zengyuhu"},
            {"id": "2608", "name": "何洽", "login_name": "qiahe"},
            {"id": "2609", "name": "许璐璐", "login_name": "luluxu"},
            {"id": "2610", "name": "程远平", "login_name": "yuanpingcheng"},
            {"id": "2611", "name": "邝洪飞", "login_name": "hongfeikuang"},
            {"id": "2619", "name": "杨梅", "login_name": "meiyang1"},
            {"id": "2620", "name": "姚越", "login_name": "yueyao"},
            {"id": "2631", "name": "唐伟", "login_name": "weitang"},
            {"id": "2632", "name": "李蕾", "login_name": "leili1"},
            {"id": "2635", "name": "汪尔康", "login_name": "erkangwang"},
            {"id": "2638", "name": "张煜昊", "login_name": "yuhaozhang"},
            {"id": "2641", "name": "聂永洪", "login_name": "yonghongnie"},
            {"id": "2642", "name": "李林", "login_name": "linli6"},
            {"id": "2644", "name": "张浩洋", "login_name": "haoyangzhang"},
            {"id": "2645", "name": "姜林", "login_name": "linjiang1"},
            {"id": "2650", "name": "杨玉柱", "login_name": "yuzhuyang"},
            {"id": "2651", "name": "张容", "login_name": "rongzhang3"},
            {"id": "2653", "name": "陈隆杰", "login_name": "longjiechen"},
            {"id": "2654", "name": "王壮", "login_name": "zhuangwang"},
            {"id": "2657", "name": "柏海军", "login_name": "haijunbai1"},
            {"id": "2658", "name": "王诚", "login_name": "chengwang3"},
            {"id": "2659", "name": "丁毅珲", "login_name": "yihuiding"},
            {"id": "2662", "name": "刘宇", "login_name": "yuliu1"},
            {"id": "2666", "name": "何雷", "login_name": "leihe"},
            {"id": "2667", "name": "张择坤", "login_name": "zekunzhang"},
            {"id": "2669", "name": "何红林", "login_name": "honglinhe"},
            {"id": "2672", "name": "王孟琛", "login_name": "mengchenwang"},
            {"id": "2679", "name": "翁敏", "login_name": "minweng"},
            {"id": "2680", "name": "林娜", "login_name": "nalin"},
            {"id": "2681", "name": "林铜浩", "login_name": "tonghaolin"},
            {"id": "2682", "name": "李亚松", "login_name": "yasongli"},
            {"id": "2685", "name": "刘小畅", "login_name": "xiaochangliu"},
            {"id": "2690", "name": "左昆洋", "login_name": "kunyangzuo"},
            {"id": "2691", "name": "姜湖柳", "login_name": "huliujiang"},
            {"id": "2694", "name": "王子巧", "login_name": "ziqiaowang"},
            {"id": "2699", "name": "李秋娅", "login_name": "qiuyali"},
            {"id": "2705", "name": "万城", "login_name": "chengwan"},
            {"id": "2707", "name": "蒲俊", "login_name": "junpu"},
            {"id": "2708", "name": "吴诗润", "login_name": "shirunwu"},
            {"id": "2720", "name": "woodpecker", "login_name": "woodpecker"},
            {"id": "2743", "name": "汪林琼", "login_name": "linqiongwang"},
            {"id": "2755", "name": "廖清", "login_name": "qingliao"},
            {"id": "2756", "name": "杨兴伟", "login_name": "xingweiyang"},
            {"id": "2758", "name": "杜森林", "login_name": "senlindu"},
            {"id": "2759", "name": "李秋凤", "login_name": "qiufengli"},
            {"id": "2774", "name": "黄迎光", "login_name": "yingguanghuang"},
            {"id": "2775", "name": "黎枫", "login_name": "fengli5"},
            {"id": "2777", "name": "杨川", "login_name": "chuanyang"},
            {"id": "2778", "name": "肖军", "login_name": "junxiao"},
            {"id": "2779", "name": "胡蕊", "login_name": "ruihu"},
            {"id": "2780", "name": "付强", "login_name": "qiangfu3"},
            {"id": "2783", "name": "秦考", "login_name": "kaoqin"},
            {"id": "2784", "name": "胡洸瑞", "login_name": "guangruihu"},
            {"id": "2787", "name": "张浩文", "login_name": "haowenzhang"},
            {"id": "2795", "name": "曹润秋", "login_name": "runqiucao"},
            {"id": "2797", "name": "王欢", "login_name": "huanwang3"},
            {"id": "2800", "name": "董煣", "login_name": "roudong"},
            {"id": "2807", "name": "陈春杉", "login_name": "chunshanchen"},
            {"id": "2808", "name": "盛中琳", "login_name": "zhonglinsheng"},
            {"id": "2809", "name": "李超", "login_name": "chaoli5"},
            {"id": "2811", "name": "赵超锐", "login_name": "chaoruizhao"},
            {"id": "2812", "name": "郭道军", "login_name": "daojunguo"},
            {"id": "2813", "name": "车琴芳", "login_name": "qinfangche"},
            {"id": "2814", "name": "胡钰杰", "login_name": "yujiehu"},
            {"id": "2815", "name": "曾世超", "login_name": "shichaozeng"},
            {"id": "2816", "name": "赵晓鹏", "login_name": "xiaopengzhao"},
            {"id": "2833", "name": "孙浩然", "login_name": "haoransun"},
            {"id": "2835", "name": "曾博壹", "login_name": "boyizeng"},
            {"id": "2836", "name": "文星烨", "login_name": "xingyewen"},
            {"id": "2839", "name": "周建宇", "login_name": "jianyuzhou"},
            {"id": "2840", "name": "邓拓洋", "login_name": "tuoyangdeng"},
            {"id": "2842", "name": "竹宇", "login_name": "yuzhu"},
            {"id": "2843", "name": "李林鑫", "login_name": "linxinli"},
            {"id": "2846", "name": "段亦婷", "login_name": "yitingduan"},
            {"id": "2848", "name": "袁娅玲", "login_name": "yalingyuan"},
            {"id": "2849", "name": "贺敬彦", "login_name": "jingyanhe"},
            {"id": "2852", "name": "刘成", "login_name": "chengliu"},
            {"id": "2854", "name": "杨李", "login_name": "liyang4"},
            {"id": "2862", "name": "李启阳", "login_name": "qiyangli"},
            {"id": "2863", "name": "廖启航", "login_name": "qihangliao"},
            {"id": "2870", "name": "王纪", "login_name": "jiwang"},
            {"id": "2871", "name": "范涛", "login_name": "taofan"},
            {"id": "2872", "name": "沈航", "login_name": "hangshen"},
            {"id": "2873", "name": "陈思思", "login_name": "sisichen"},
            {"id": "2874", "name": "叶成", "login_name": "chengye1"},
            {"id": "2877", "name": "赵兴旺", "login_name": "xingwangzhao"},
            {"id": "2878", "name": "何桥柱", "login_name": "qiaozhuhe"},
            {"id": "2882", "name": "陈治年", "login_name": "zhinianchen"},
            {"id": "2883", "name": "覃韩", "login_name": "hanqin"},
            {"id": "2884", "name": "苏湘远", "login_name": "xiangyuansu"},
            {"id": "2887", "name": "张晨", "login_name": "chenzhang"},
            {"id": "2888", "name": "杨旭帆", "login_name": "xufanyang"},
            {"id": "2891", "name": "刘继斌", "login_name": "jibinliu"},
            {"id": "2892", "name": "蒲利苹", "login_name": "lipingpu"},
            {"id": "2893", "name": "罗刚强", "login_name": "gangqiangluo"},
            {"id": "2894", "name": "蒲庆", "login_name": "qingpu"},
            {"id": "2895", "name": "李宏举", "login_name": "hongjuli1"},
            {"id": "2896", "name": "邱达河", "login_name": "daheqiu"},
            {"id": "2897", "name": "肖洋", "login_name": "yangxiao2"},
            {"id": "2898", "name": "赵旭东", "login_name": "xudongzhao"},
            {"id": "2899", "name": "文雨航", "login_name": "yuhangwen"},
            {"id": "2900", "name": "何芳", "login_name": "fanghe1"},
            {"id": "2901", "name": "罗亮", "login_name": "liangluo"},
            {"id": "2903", "name": "尹香兰", "login_name": "xianglanyin"},
            {"id": "2904", "name": "张小兵", "login_name": "xiaobingzhang"},
            {"id": "2907", "name": "王雪锋", "login_name": "xuefengwang1"},
            {"id": "2908", "name": "杜争龙", "login_name": "zhenglongdu"},
            {"id": "2911", "name": "候望", "login_name": "wanghou"},
            {"id": "2914", "name": "张明敏", "login_name": "mingminzhang"},
            {"id": "2918", "name": "刘泽霖", "login_name": "zelinliu"},
            {"id": "2923", "name": "阳青松", "login_name": "qingsongyang"},
            {"id": "2924", "name": "马云超", "login_name": "yunchaoma"},
            {"id": "2925", "name": "柏川", "login_name": "chuanbai"},
            {"id": "2926", "name": "袁野", "login_name": "yeyuan1"},
            {"id": "2930", "name": "王懿", "login_name": "yiwang5"},
            {"id": "2931", "name": "戴辉林", "login_name": "huilindai"},
            {"id": "2932", "name": "黄钰斐", "login_name": "yufeihuang"},
            {"id": "2935", "name": "余聪", "login_name": "congyu"},
            {"id": "2936", "name": "罗阿玲", "login_name": "alingluo"},
            {"id": "2939", "name": "徐津", "login_name": "jinxu"},
            {"id": "2941", "name": "郑宇", "login_name": "yuzheng3"},
            {"id": "2942", "name": "林格", "login_name": "gelin"},
            {"id": "2945", "name": "凌洋生", "login_name": "yangshengling"},
            {"id": "2946", "name": "张镜明", "login_name": "jingmingzhang"},
            {"id": "2949", "name": "雷兴林", "login_name": "xinglinlei"},
            {"id": "2955", "name": "郭芮茜", "login_name": "ruiqianguo"},
            {"id": "2956", "name": "李若强", "login_name": "ruoqiangli"},
            {"id": "2957", "name": "游鑫", "login_name": "xinyou"},
            {"id": "2958", "name": "李鑫", "login_name": "xinli5"},
            {"id": "2961", "name": "何颖", "login_name": "yinghe2"},
            {"id": "2963", "name": "青娜", "login_name": "naqing"},
            {"id": "2965", "name": "吴邱", "login_name": "qiuwu"},
            {"id": "2966", "name": "王胜", "login_name": "shengwang"},
            {"id": "2969", "name": "李贤策", "login_name": "xianceli"},
            {"id": "2970", "name": "马克", "login_name": "kema1"},
            {"id": "2973", "name": "申文静", "login_name": "wenjingshen"},
            {"id": "2974", "name": "熊沫", "login_name": "moxiong"},
            {"id": "2975", "name": "李耀东", "login_name": "yaodongli"},
            {"id": "2976", "name": "付红铮", "login_name": "hongzhengfu1"},
            {"id": "2977", "name": "张强", "login_name": "qiangzhang1"},
            {"id": "2978", "name": "易鑫宇", "login_name": "xinyuyi"},
            {"id": "2980", "name": "李怡静", "login_name": "yijingli"},
            {"id": "2981", "name": "张传昌", "login_name": "chuanchangzhang"},
            {"id": "2982", "name": "余文斌", "login_name": "wenbinyu"},
            {"id": "2983", "name": "何星洁", "login_name": "xingjiehe"},
            {"id": "2984", "name": "唐洪霄", "login_name": "hongxiaotang"},
            {"id": "2986", "name": "虎学强", "login_name": "xueqianghu"},
            {"id": "2987", "name": "陈增", "login_name": "zengchen"},
            {"id": "2988", "name": "杨芮", "login_name": "ruiyang1"},
            {"id": "2989", "name": "王浩宇", "login_name": "haoyuwang"},
            {"id": "2991", "name": "龙云东", "login_name": "yundonglong"},
            {"id": "2992", "name": "刘鑫", "login_name": "xinliu5"},
            {"id": "2995", "name": "谢雷", "login_name": "leixie2"},
            {"id": "2996", "name": "郑利波", "login_name": "libozheng"},
            {"id": "2997", "name": "刘凯", "login_name": "kailiu1"},
            {"id": "2999", "name": "周洋", "login_name": "yangzhou3"},
            {"id": "3000", "name": "穆炎龙", "login_name": "yanlongmu"},
            {"id": "3001", "name": "刘添星", "login_name": "tianxingliu"},
            {"id": "3002", "name": "尚扬帆", "login_name": "yangfanshang"},
            {"id": "3004", "name": "李红贤", "login_name": "hongxianli"},
            {"id": "3005", "name": "王杰", "login_name": "jiewang7"},
            {"id": "3006", "name": "李鸿林", "login_name": "honglinli"},
            {"id": "3007", "name": "王万双", "login_name": "wanshuangwang"},
            {"id": "3008", "name": "许洪", "login_name": "hongxu"},
            {"id": "3009", "name": "廖文静", "login_name": "wenjingliao"},
            {"id": "3010", "name": "阮飞鹏", "login_name": "feipengruan"},
            {"id": "3011", "name": "潘颖琳", "login_name": "yinglinpan"},
            {"id": "3012", "name": "周柯宇", "login_name": "keyuzhou"},
            {"id": "3013", "name": "张智发", "login_name": "zhifazhang"},
            {"id": "3014", "name": "曾子涵", "login_name": "zihanzeng"},
            {"id": "3015", "name": "莫诏铭", "login_name": "zhaomingmo"},
            {"id": "3016", "name": "尹灿", "login_name": "canyin"},
            {"id": "3017", "name": "傅许靖", "login_name": "xujingfu1"},
            {"id": "3018", "name": "杜雨璐", "login_name": "yuludu"},
            {"id": "3019", "name": "曾晶", "login_name": "jingzeng"},
            {"id": "3020", "name": "付成骥", "login_name": "chengjifu"},
            {"id": "3021", "name": "刁翔", "login_name": "xiangdiao"},
            {"id": "3022", "name": "肖小龙", "login_name": "xiaolongxiao"},
            {"id": "3024", "name": "杨俊峰", "login_name": "junfengyang1"},
            {"id": "3025", "name": "冯益", "login_name": "yifeng1"},
            {"id": "3026", "name": "周文峰", "login_name": "wenfengzhou"},
            {"id": "3027", "name": "周鹏", "login_name": "pengzhou1"},
            {"id": "3028", "name": "孙云峰", "login_name": "yunfengsun"},
            {"id": "3029", "name": "梁正钱", "login_name": "zhengqianliang"},
            {"id": "3030", "name": "梁晓航", "login_name": "xiaohangliang"},
            {"id": "3031", "name": "夏功一", "login_name": "gongyixia"},
            {"id": "3032", "name": "符长江", "login_name": "changjiangfu"},
            {"id": "3033", "name": "祝尚宇", "login_name": "shangyuzhu"},
            {"id": "3034", "name": "安永端", "login_name": "yongduanan"},
            {"id": "3035", "name": "谢朝东", "login_name": "chaodongxie"},
            {"id": "3036", "name": "岳思思", "login_name": "sisiyue"},
            {"id": "3037", "name": "黄倬", "login_name": "zhuohuang"},
            {"id": "3038", "name": "刘琴", "login_name": "qinliu1"},
            {"id": "3039", "name": "杨威", "login_name": "weiyang6"},
            {"id": "3040", "name": "罗亚婷", "login_name": "yatingluo"},
            {"id": "3041", "name": "赵婧婷", "login_name": "jingtingzhao"},
            {"id": "3042", "name": "王冬生", "login_name": "dongshengwang"},
            {"id": "3043", "name": "杨瑶", "login_name": "yaoyang"},
            {"id": "3044", "name": "朱鑫方", "login_name": "xinfangzhu"},
            {"id": "3045", "name": "曹园园", "login_name": "yuanyuancao"},
            {"id": "3046", "name": "何俊成", "login_name": "junchenghe"},
            {"id": "3047", "name": "谢昊成", "login_name": "haochengxie"},
            {"id": "3048", "name": "王运博", "login_name": "yunbowang"},
            {"id": "3049", "name": "吴杰", "login_name": "jiewu2"},
            {"id": "3050", "name": "匡亚洲", "login_name": "yazhoukuang"},
            {"id": "3051", "name": "雷天才", "login_name": "tiancailei"},
            {"id": "3052", "name": "胡国强", "login_name": "guoqianghu"},
            {"id": "3053", "name": "严丹", "login_name": "danyan"}]


def convert_utc_to_utc8_format(dt_obj: datetime) -> str:
    """
    将 UTC 时间的 datetime 对象转换为 UTC+8 时区的 'YYYY-MM-DD HH:MM:SS' 格式字符串。

    Args:
        dt_obj: 一个包含时区信息的 datetime 对象 (预期为 UTC)。

    Returns:
        格式化后的时间字符串。

    Raises:
        ValueError: 如果输入的 datetime 对象没有时区信息 (naive datetime)。
    """
    # 1. 健壮性检查：确保输入是 aware datetime (包含时区信息)
    if dt_obj.tzinfo is None:
        raise ValueError("输入的 datetime 对象必须包含时区信息 (tzinfo)。")

    # 2. 时区转换
    # 方法 A (推荐): 使用 zoneinfo (Python 3.9+) 处理复杂的时区规则 (如夏令时，虽然 UTC+8 没有)
    # from zoneinfo import ZoneInfo
    # target_tz = ZoneInfo("Asia/Shanghai")
    # dt_utc8 = dt_obj.astimezone(target_tz)

    # 方法 B (通用且高效): 直接使用 timedelta 偏移 +8 小时
    # 对于固定的 UTC+8 偏移，这种方法无需额外依赖，逻辑清晰
    utc8_offset = timedelta(hours=8)
    utc8_tz = timezone(utc8_offset)
    dt_utc8 = dt_obj.astimezone(utc8_tz)

    # 3. 格式化输出
    # 格式代码: %Y(年)-%m(月)-%d(日) %H(24 小时制)-%M(分)-%S(秒)
    formatted_time = dt_utc8.strftime("%Y-%m-%d %H:%M:%S")

    return formatted_time


def find_test_user(name):
    for user in test_user:
        if user['login_name'].lower() == name.lower():
            return user
    return None


def find_assign_user(name):
    for user in all_user:
        if user['login_name'].lower() == name.lower():
            return user
    return None


def find_assignees(issue_id):
    sql = 'select distinct b.email from issue_assignees a left join users b on a.assignee_id = b.id where a.issue_id = %s and a.deleted_at is null'
    cursor.execute(sql, (issue_id,))
    results = [i['email'].split('@')[0] for i in cursor.fetchall()]
    return results


def find_state(state_id):
    sql = 'select name from states where id = %s'
    cursor.execute(sql, (state_id,))
    result = cursor.fetchone()
    return result['name']


def find_project(project_id):
    sql = 'select name,identifier from projects where id = %s'
    cursor.execute(sql, (project_id,))
    result = cursor.fetchone()
    return result


def find_project_product_type(project_id):
    sql = 'select product_type from projects where id = %s'
    cursor.execute(sql, (project_id,))
    result = cursor.fetchone()
    return result


def find_user(user_id):
    sql = 'select email from users where id = %s'
    cursor.execute(sql, (user_id,))
    result = cursor.fetchone()
    return result['email'].split('@')[0]


def get_issuer_last_comment(issue_id):
    sql = 'select comment_stripped from issue_comments where issue_id = %s order by created_at desc '
    cursor.execute(sql, (issue_id,))
    result = cursor.fetchone()
    return result['comment_stripped'] if result else None


def parse_args():
    parser = argparse.ArgumentParser(description="创建任务")
    parser.add_argument('--start_date', default=date_str, required=False, help='开始日期')
    parser.add_argument('--end_date', default=None, required=False, help='结束日期')
    return parser.parse_args()


def select_bug_items():
    args = parse_args()
    excel_data = list()
    sql = """
          select a.*
          from issues a
                   left join issue_types b on a.type_id = b.id
          where a.deleted_at is null
            and b.name in ('缺陷','缺陷(软件)')
            and a.workspace_id in (select id
                                   from workspaces
                                   where slug in ('kfcd'))
            and a.created_at >= %s
          """
    params = [args.start_date]

    if args.end_date:
        sql += ' and a.created_at <= %s'
        params.append(args.end_date)
    sql += ' order by a.created_at desc'
    cursor.execute(sql, tuple(params))
    results = cursor.fetchall()
    print(results)
    for index, result in enumerate(results):
        assignees_name = find_assignees(result.get('id'))
        assignees = list()
        for assignee in assignees_name:
            try:
                assignees.append(find_assign_user(assignee)['name'])
            except Exception as e:
                print(e)
        state = find_state(result.get('state_id'))
        last_comment = get_issuer_last_comment(result.get('id'))
        created_user = find_assign_user(find_user(result.get('created_by_id')))['name']
        project = find_project(result.get('project_id'))
        product_type = find_project_product_type(result.get('project_id'))
        url = f'http://192.168.100.225/{workspace_display_dict[result["workspace_id"]]}/browse/{project["identifier"]}-{result["sequence_id"]}/'
        excel_data.append(
            {'序号': index + 1, 'ID': result.get('id'), '标题': result.get('name'), '地址': url,
             '创建时间': convert_utc_to_utc8_format(result['created_at']),
             '产品类型': product_type['product_type'], '当前负责人': ','.join(assignees),
             '创建人': created_user, '状态': state,
             '技术原因及解决方案': last_comment, '项目': project['name'], '缺陷级别': result.get('priority')}
        )
    return excel_data


def save_to_excel_with_custom_width(
        data: List[Dict[str, Any]],
        filename: str = "缺陷报告.xlsx",
        custom_widths: Optional[Dict[str, int]] = None
) -> str:
    """
    将字典列表保存为 Excel，并支持自定义列宽。

    参数:
        data: 字典列表数据
        filename: 输出文件名
        custom_widths: 字典，键为列名，值为宽度。例如 {'标题': 40}
    """
    if not data:
        print("⚠️ 数据为空，未生成文件。")
        return ""

    # 1. 定义默认列宽配置 (根据你的需求)
    default_custom_widths = {
        '标题': 40,
        '当前负责人': 20,
        '状态': 15,
        '技术原因及解决方案': 80,
        '项目': 30,
        'ID': 15,
        '地址': 20,
    }

    # 如果用户传入了自定义配置，则合并 (用户配置优先)
    if custom_widths:
        default_custom_widths.update(custom_widths)

    try:
        # 2. 创建 DataFrame
        df = pd.DataFrame(data)

        # 3. 写入 Excel
        # 使用 openpyxl 引擎以便后续操作样式
        with pd.ExcelWriter(filename, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Sheet1')

            # 4. 获取 worksheet 对象进行列宽调整
            worksheet = writer.sheets['Sheet1']

            # 5. 遍历所有列进行宽度设置
            for column in worksheet.columns:
                column_letter = column[0].column_letter
                header_name = str(column[0].value)  # 获取表头名称

                # 判断是否在自定义配置中
                if header_name in default_custom_widths:
                    # 使用指定宽度
                    width = default_custom_widths[header_name]
                else:
                    # 其他列：自动计算最大内容长度作为宽度
                    max_length = 0
                    for cell in column:
                        if cell.value is not None:
                            try:
                                length = len(str(cell.value))
                                if length > max_length:
                                    max_length = length
                            except:
                                pass
                    # 基础宽度 + 内容长度，最大不超过 50，防止太宽
                    width = min(max_length + 2, 50)
                    # 设置一个最小宽度，避免太窄
                    if width < 10:
                        width = 10

                # 应用列宽
                worksheet.column_dimensions[column_letter].width = width

        print(f"✅ 成功生成 Excel: {filename}")
        print(f"📊 行数: {len(df)}, 列数: {len(df.columns)}")
        return filename

    except Exception as e:
        print(f"❌ 生成失败: {e}")
        return ""


result = select_bug_items()
save_to_excel_with_custom_width(result)
