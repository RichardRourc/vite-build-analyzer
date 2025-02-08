import path from 'path';
import type { Plugin } from 'vite';

export function buildProfilerPlugin(): Plugin {
  const moduleTransformTimes = new Map<string, number>();
  const slowModules: Array<{ id: string; time: number }> = [];
  const startTimes = new Map<string, number>();
  const processedIds = new Set<string>(); // 新增：用于去重

  let totalModules = 0;
  let processedModules = 0;
  let buildStartTime = 0;

  // 新增：规范化路径处理
  const normalizePath = (id: string): string => {
    // 移除查询参数
    const cleanId = id.split('?')[0];
    // 统一分隔符
    return cleanId.split(path.sep).join('/');
  };

  // 新增：获取显示用的短路径
  const getShortId = (id: string): string => {
    const normalizedId = normalizePath(id);
    return (
      normalizedId.split('/src/')[1] || normalizedId.split('/node_modules/')[1] || normalizedId
    );
  };

  return {
    name: 'build-profiler',
    enforce: 'pre',

    buildStart() {
      try {
        console.log('\n📊 构建性能分析已启动');
        // 重置所有状态
        totalModules = 0;
        processedModules = 0;
        moduleTransformTimes.clear();
        slowModules.length = 0;
        startTimes.clear();
        processedIds.clear();
        buildStartTime = performance.now();
      } catch (error) {
        console.error('构建启动时出错:', error);
      }
    },

    transform(_, id) {
      try {
        const normalizedId = normalizePath(id);

        // 只在首次处理时计数
        if (!processedIds.has(normalizedId)) {
          processedIds.add(normalizedId);
          totalModules++;

          // 显示项目文件的处理
          if (!normalizedId.includes('node_modules')) {
            console.log(`\n📦 模块总数: ${totalModules}`);
          }
        }

        startTimes.set(normalizedId, performance.now());
        return null;
      } catch (error) {
        console.error('转换模块时出错:', error);
        return null;
      }
    },

    moduleParsed(id) {
      try {
        const normalizedId = normalizePath(id.id);
        const startTime = startTimes.get(normalizedId);
        if (!startTime) return;

        const duration = performance.now() - startTime;
        moduleTransformTimes.set(normalizedId, duration);
        processedModules++;

        // 记录慢模块
        if (duration > 200) {
          slowModules.push({ id: normalizedId, time: duration });
          console.log(`⚠️ 慢模块: ${getShortId(normalizedId)} (${duration.toFixed(2)}ms)`);
        }

        // 进度显示
        if (processedModules % 100 === 0 || processedModules === totalModules) {
          const progress = ((processedModules / totalModules) * 100).toFixed(1);
          const elapsedTime = (performance.now() - buildStartTime) / 1000;
          const avgTimePerModule = elapsedTime / processedModules;
          const remainingModules = totalModules - processedModules;
          const estimatedRemainingTime = (remainingModules * avgTimePerModule).toFixed(1);

          console.log(
            `\n📈 构建进度: ${progress}% (${processedModules}/${totalModules})` +
              `\n⏱️  已用时: ${elapsedTime.toFixed(1)}s, 预计还需: ${estimatedRemainingTime}s` +
              `\n🔍 模块分布: ${moduleTransformTimes.size} 个已处理, ${slowModules.length} 个慢模块`
          );
        }

        // 清理已处理的模块
        startTimes.delete(normalizedId);
      } catch (error) {
        console.error('处理模块解析时出错:', error);
      }
    },

    closeBundle() {
      try {
        console.log('\n=== 构建性能分析报告 ===');

        if (slowModules.length === 0) {
          console.log('\n❌ 没有收集到模块处理时间数据');
          return;
        }

        // 最慢模块排序和显示
        slowModules.sort((a, b) => b.time - a.time);
        console.log('\n🐢 最慢的 10 个模块:');
        slowModules.slice(0, 10).forEach(({ id, time }) => {
          console.log(`   ${time.toFixed(2)}ms - ${getShortId(id)}`);
        });

        // 按目录统计
        const dirStats = new Map<string, { count: number; time: number }>();
        moduleTransformTimes.forEach((time, id) => {
          const dir = id.split('/node_modules/')[1]?.split('/')[0] || '项目源码';
          const stat = dirStats.get(dir) || { count: 0, time: 0 };
          dirStats.set(dir, {
            count: stat.count + 1,
            time: stat.time + time
          });
        });

        console.log('\n📊 按目录统计:');
        Array.from(dirStats.entries())
          .sort((a, b) => b[1].time - a[1].time)
          .slice(0, 10)
          .forEach(([dir, { count, time }]) => {
            console.log(`   ${dir}: ${count}个文件, 总耗时${(time / 1000).toFixed(2)}s`);
          });

        // 总体统计
        const totalTime = Array.from(moduleTransformTimes.values()).reduce((a, b) => a + b, 0);
        console.log('\n📈 总体统计:');
        console.log(`   - 总模块数: ${totalModules}`);
        console.log(`   - 慢模块数: ${slowModules.length}`);
        console.log(`   - 模块处理总耗时: ${(totalTime / 1000).toFixed(2)}s`);
        console.log(`   - 平均每个模块耗时: ${(totalTime / totalModules).toFixed(2)}ms`);
      } catch (error) {
        console.error('生成构建报告时出错:', error);
      }
    }
  };
}
