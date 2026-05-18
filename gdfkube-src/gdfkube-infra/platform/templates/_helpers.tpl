{{- define "gdfkube-platform.source" -}}
repoURL: {{ .Values.source.repoURL }}
targetRevision: {{ .Values.source.targetRevision }}
{{- end -}}

{{- define "gdfkube-platform.destination" -}}
server: {{ .Values.argocd.destination.server }}
namespace: {{ .Values.workload.namespace }}
{{- end -}}

{{- define "gdfkube-platform.syncPolicy" -}}
automated:
  prune: true
  selfHeal: true
{{- end -}}
