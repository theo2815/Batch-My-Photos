'use client'

import React, { useEffect, useState, useCallback } from 'react';
import { useAppSimulator, SIMULATOR_STATE } from '../simulator/useAppSimulator';
import SimulatorLayout from '../simulator/components/SimulatorLayout';
import SimulatorHistory from '../simulator/components/SimulatorHistory';
import SimulatorUndoConfirmation from '../simulator/components/SimulatorUndoConfirmation';

// Step components
import ImportStep from '../simulator/components/steps/ImportStep';
import PreviewStep from '../simulator/components/steps/PreviewStep';
import ProcessingStep from '../simulator/components/steps/ProcessingStep';
import SummaryStep from '../simulator/components/steps/SummaryStep';
import { trackStepReached, trackDemoAbandoned } from '../simulator/analytics';

const DemoPage = () => {
    const {
        state, progress, currentFile, photos, groups, stats, batches,
        settings, selectedFolder, elapsedTime, demoFolders, history,
        selectFolder, startImport, updateSettings, runBatch, cancelProcessing, reset,
        deleteHistory, clearHistory, validateHistoryEntry,
        // Undo flow
        handleHistoryUndoClick, confirmHistoryUndo, cancelHistoryUndo,
        pendingHistoryUndo, showHistoryUndoConfirmation,
        isRollingBack, undoCompleteResult, clearUndoComplete,
    } = useAppSimulator();

    const [historyOpen, setHistoryOpen] = useState(false);
    const [simTheme, setSimTheme] = useState('dark');

    const toggleSimTheme = useCallback(() => {
        setSimTheme(prev => prev === 'dark' ? 'light' : 'dark');
    }, []);

    // Track page view + cleanup
    useEffect(() => {
        trackStepReached('demo_loaded');
        document.title = 'BatchMyPhotos — Interactive Demo';
        
        return () => {
            if (state !== SIMULATOR_STATE.COMPLETE) {
                trackDemoAbandoned(state);
            }
        };
    }, [state]);

    // Determine which step component to render based on state
    const renderStep = () => {
        switch (state) {
            case SIMULATOR_STATE.IDLE:
                return (
                    <ImportStep 
                        demoFolders={demoFolders} 
                        selectedFolder={selectedFolder} 
                        selectFolder={selectFolder}
                        onImport={startImport}
                        isImporting={false}
                    />
                );
            case SIMULATOR_STATE.IMPORTING:
            case SIMULATOR_STATE.ANALYZING:
                return (
                    <ImportStep 
                        state={state} 
                        progress={progress} 
                        currentFile={currentFile} 
                        isImporting={true}
                        selectedFolder={selectedFolder}
                    />
                );
            case SIMULATOR_STATE.READY:
                return (
                    <PreviewStep
                        photos={photos}
                        groups={groups}
                        batches={batches}
                        stats={stats}
                        settings={settings}
                        updateSettings={updateSettings}
                        onProcess={runBatch}
                        onSelectDifferent={reset}
                        selectedFolder={selectedFolder}
                    />
                );
            case SIMULATOR_STATE.PROCESSING:
                return (
                    <ProcessingStep
                        progress={progress}
                        currentFile={currentFile}
                        batches={batches}
                        batchMode={settings.batchMode}
                        onCancel={isRollingBack ? undefined : cancelProcessing}
                        isRollback={isRollingBack}
                    />
                );
            case SIMULATOR_STATE.COMPLETE:
                return (
                    <SummaryStep
                        batches={batches}
                        stats={stats}
                        elapsedTime={elapsedTime}
                        onReset={() => {
                            clearUndoComplete();
                            reset();
                        }}
                        selectedFolder={selectedFolder}
                        hasHistory={history.length > 0}
                        onShowHistory={() => setHistoryOpen(true)}
                        undoCompleteResult={undoCompleteResult}
                        onClearUndoComplete={clearUndoComplete}
                    />
                );
            default:
                return (
                    <ImportStep 
                        demoFolders={demoFolders} 
                        selectedFolder={selectedFolder} 
                        selectFolder={selectFolder}
                        onImport={startImport}
                        isImporting={false}
                    />
                );
        }
    };

    // Auto-scroll logic needs to be passed to layout if we are in PREVIEW state
    const needsScroll = state === SIMULATOR_STATE.COMPLETE;

    return (
        <SimulatorLayout
            scrollMain={needsScroll}
            onShowHistory={() => setHistoryOpen(true)}
            hasHistory={history.length > 0}
            simTheme={simTheme}
            onToggleTheme={toggleSimTheme}
            modals={
                <>
                    <SimulatorHistory
                        isOpen={historyOpen}
                        onClose={() => setHistoryOpen(false)}
                        history={history}
                        onDelete={deleteHistory}
                        onClearAll={clearHistory}
                        onUndo={(entry) => {
                            handleHistoryUndoClick(entry);
                        }}
                        onValidate={validateHistoryEntry}
                    />

                    {/* Undo confirmation rendered AFTER HistoryModal so it stacks on top */}
                    <SimulatorUndoConfirmation
                        isOpen={showHistoryUndoConfirmation}
                        rollbackInfo={pendingHistoryUndo ? {
                            totalFiles: pendingHistoryUndo.totalFiles,
                            batchFolderCount: pendingHistoryUndo.batchFolderCount,
                        } : null}
                        onConfirm={() => {
                            setHistoryOpen(false);
                            confirmHistoryUndo();
                        }}
                        onClose={cancelHistoryUndo}
                    />
                </>
            }
        >
            {renderStep()}
        </SimulatorLayout>
    );
};

export default DemoPage;
