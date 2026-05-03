import * as vscode from 'vscode';

/**
 * Manages the XibeCode status bar item in the bottom bar.
 */
export class StatusBarManager implements vscode.Disposable {
  private item: vscode.StatusBarItem;

  constructor() {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    this.item.command = 'xibecode.openChat';
    this.item.tooltip = 'XibeCode AI Agent';
    this.item.show();
  }

  setIdle(): void {
    this.item.text = '$(hubot) XibeCode';
    this.item.backgroundColor = undefined;
  }

  setRunning(): void {
    this.item.text = '$(loading~spin) XibeCode Running…';
    this.item.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  }

  dispose(): void {
    this.item.dispose();
  }
}
