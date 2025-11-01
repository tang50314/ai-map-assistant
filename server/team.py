# team.py - 主要的团队处理模块入口
import asyncio
from typing import Any, Dict, Optional, List, AsyncGenerator
from datetime import datetime
import sys
from sqlalchemy.orm import Session

# 从新的模块结构中导入所有功能
from teams import (
    process_general_query,
    process_route_query, 
    process_travel_query,
    process_map_query_stream,
    process_map_query
)

# 导出所有功能，保持向后兼容性
__all__ = [
    "process_general_query",
    "process_route_query", 
    "process_travel_query",
    "process_map_query_stream",
    "process_map_query"
]

# 测试函数
async def main():
    """测试函数"""
    test_queries = [
        "查询钱塘区未来三天的天气状况"
    ]
    
    for query in test_queries:
        try:
            print(f"\n{'='*60}")
            print(f"开始测试查询: {query}")
            print(f"{'='*60}")
            
            result = await process_map_query(query)
            print(f"\n🎯 最终结果:\n{result}")
        except Exception as e:
            print(f"❌ 测试查询 '{query}' 失败: {str(e)}")
        await asyncio.sleep(2)  # 避免过于频繁的请求

if __name__ == "__main__":
    asyncio.run(main())