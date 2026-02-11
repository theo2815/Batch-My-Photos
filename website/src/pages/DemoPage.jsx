import React, { useEffect } from 'react';
import SimulatorLayout from '../simulator/components/SimulatorLayout';
import ImportStep from '../simulator/components/steps/ImportStep';
import PreviewStep from '../simulator/components/steps/PreviewStep';
import ProcessingStep from '../simulator/components/steps/ProcessingStep';
import SummaryStep from '../simulator/components/steps/SummaryStep';
import { useAppSimulator, SIMULATOR_STATE } from '../simulator/useAppSimulator';
import { trackStepReached, trackDemoAbandoned } from '../simulator/analytics';

const DemoPage = () => {
    const { 
        state, progress, currentFile, photos, groups, stats, batches,
        settings, selectedFolder, elapsedTime, demoFolders,
        selectFolder, startImport, updateSettings, runBatch, cancelProcessing, reset,
    } = useAppSimulator();

    // Track page view + cleanup
    useEffect(() => {
        trackStepReached('demo_loaded');
        document.title = 'BatchMyPhotos — Interactive Demo';
        
        return () => {
            document.title = 'BatchMyPhotos';
            if (state !== SIMULATOR_STATE.COMPLETE && state !== SIMULATOR_STATE.IDLE) {
                trackDemoAbandoned(state);
            }
        };
    }, []);

    // PreviewStep needs scrollable main area (content is tall)
    const needsScroll = state === SIMULATOR_STATE.READY || state === SIMULATOR_STATE.COMPLETE;

    return (
        <SimulatorLayout scrollMain={needsScroll}>
            {(state === SIMULATOR_STATE.IDLE || state === SIMULATOR_STATE.IMPORTING || state === SIMULATOR_STATE.ANALYZING) ? (
                <ImportStep 
                    onImport={startImport} 
                    isImporting={state !== SIMULATOR_STATE.IDLE}
                    currentFile={currentFile}
                    progress={progress}
                    state={state}
                    demoFolders={demoFolders}
                    selectedFolder={selectedFolder}
                    selectFolder={selectFolder}
                />
            ) : state === SIMULATOR_STATE.READY ? (
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
            ) : state === SIMULATOR_STATE.PROCESSING ? (
                <ProcessingStep 
                    progress={progress}
                    batches={batches}
                    batchMode={settings.batchMode}
                    onCancel={cancelProcessing}
                />
            ) : state === SIMULATOR_STATE.COMPLETE ? (
                <SummaryStep 
                    batches={batches}
                    stats={stats}
                    elapsedTime={elapsedTime}
                    onReset={reset}
                    selectedFolder={selectedFolder}
                />
            ) : null}
        </SimulatorLayout>
    );
};

export default DemoPage;