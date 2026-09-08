module.exports = {
  forbidden: [
    {
      name: 'neutrality',
      severity: 'error',
      from: { pathNot: '(^|/)node_modules/@agentshouse/mdruntime-adapter/' },
      to: {
        path: '(^|/)(agents\\.house|agents-house)(/|$)|(^|/)@agents-house/|(^|/)packages/mdruntime-adapter/|(^|/)@agentshouse/mdruntime-adapter(/|$)',
      },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'default'],
    },
    parser: 'tsc',
    tsPreCompilationDeps: true,
    combinedDependencies: true,
  },
};
