import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * The last thing between a mistake and an empty screen.
 *
 * React 19 does not leave a broken component where it is: an error thrown
 * during render unmounts the entire tree, root included. Without one of these
 * anywhere in the app that means a white page with nothing on it — no header,
 * no footer, no way back — and the only remedy a person has is to guess that
 * reloading might help. That is exactly what was happening (see the note above
 * the brief query in RoundHomePage), and the bug that caused it was two lines
 * long. The cost of not having a boundary was far larger than the bug.
 *
 * So: one screen's failure stays one screen's failure. The rest of the app
 * keeps its chrome, the message says what to do, and the error itself is
 * printed rather than hidden — this app is tested by people who will read it
 * out to us, and "something went wrong" wastes that.
 *
 * `resetKey` is the route. A boundary that has caught something stays caught
 * forever otherwise, so a person who navigates away would carry the wreckage
 * of the previous page with them.
 */
interface Props {
  children: ReactNode
  resetKey?: string
}

interface State {
  error: Error | null
  // The key the caught error belongs to. Held in state rather than compared in
  // componentDidUpdate so that walking away from a broken page clears it
  // during the render that leaves, not in a second render afterwards.
  seenKey: string | undefined
}

class Boundary extends Component<Props & { labels: Labels }, State> {
  state: State = { error: null, seenKey: undefined }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    if (state.error && props.resetKey !== state.seenKey) return { error: null }
    return { seenKey: props.resetKey }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Nothing is collected anywhere yet, so the console is the whole of the
    // reporting. Kept deliberately: the stack React hands over here names the
    // component, which the browser's own error does not.
    console.error('A screen crashed:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="stack sheet" role="alert">
        <h1>{this.props.labels.title}</h1>
        <p>{this.props.labels.body}</p>
        <p className="muted">
          <code>{error.message}</code>
        </p>
        <div className="row">
          <button type="button" onClick={() => window.location.reload()}>
            {this.props.labels.reload}
          </button>
        </div>
      </div>
    )
  }
}

interface Labels {
  title: string
  body: string
  reload: string
}

/**
 * The hook wrapper exists because a boundary has to be a class — there is no
 * hook for it — and a class cannot call useTranslation. The words are read out
 * here and handed down.
 */
export function ErrorBoundary({ children, resetKey }: Props) {
  const { t } = useTranslation()
  return (
    <Boundary
      resetKey={resetKey}
      labels={{
        title: t('errors.crashed.title'),
        body: t('errors.crashed.body'),
        reload: t('errors.crashed.reload'),
      }}
    >
      {children}
    </Boundary>
  )
}
